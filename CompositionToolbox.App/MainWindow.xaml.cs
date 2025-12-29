using System;
using System.ComponentModel;
using System.IO;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Threading;
using CompositionToolbox.App.Models;
using CompositionToolbox.App.Services;
using CompositionToolbox.App.Stores;
using CompositionToolbox.App.ViewModels;
using CompositionToolbox.App.Views;

namespace CompositionToolbox.App
{
    public partial class MainWindow : Window
    {
        private readonly MainViewModel _vm;
        private NotationView? _notation;
        private InitializationView? _initView;
        private SettingsWindow? _settingsWindow;
        private PresetPickerDialog? _presetPickerDialog;
        private Views.PitchListCatalogWindow? _pitchListCatalogWindow;
        private readonly System.Windows.Controls.Grid _workspaceGrid = new();
        private readonly SettingsService _settingsService;
        private readonly AppSettings _appSettings;
        private readonly ProjectService _projectService;
        private bool _transformLogSelectionHooked;

        public MainWindow()
        {
            InitializeComponent();
            _settingsService = new SettingsService();
            _appSettings = _settingsService.Load();
            var projectPath = EnsureProjectFolder();
            _projectService = new ProjectService(projectPath);
            var store = new CompositeStore();
            store.Load(_projectService.LoadOrCreate());
            DataContext = new MainViewModel(_settingsService, _appSettings, store, _projectService);
            _vm = (MainViewModel)DataContext;
            _vm.PresetPickerRequested += (_, _) => OpenPresetPicker();
            _vm.PitchListCatalogRequested += (_, _) => OpenPitchListCatalog();
            _vm.RealizationConfigChanged += (_, _) =>
            {
                UpdateNotation();
                _vm.Inspector.RefreshRealization();
                if (_presetPickerDialog?.DataContext is PresetPickerViewModel presetVm)
                {
                    presetVm.RefreshRealization();
                }
            };
            if (System.Windows.Application.Current is App app)
            {
                app.InitializeServices(_settingsService, _appSettings);
            }

            ApplyWindowSettings();
            Closing += MainWindow_Closing;

            // create and reuse the Initialization view and Notation view
            _initView = new InitializationView { DataContext = _vm.Initialization };
            _notation = new NotationView();
            _notation.Margin = new Thickness(0, 0, 0, 4);
            _notation.SizeChanged += (_, _) => UpdateNotation();
            _workspaceGrid.RowDefinitions.Add(new System.Windows.Controls.RowDefinition { Height = new GridLength(1, GridUnitType.Star) });
            _workspaceGrid.RowDefinitions.Add(new System.Windows.Controls.RowDefinition { Height = GridLength.Auto });
            System.Windows.Controls.Grid.SetRow(_initView, 0);
            System.Windows.Controls.Grid.SetRow(_notation, 1);
            _workspaceGrid.Children.Add(_initView);
            _workspaceGrid.Children.Add(_notation);
            WorkspaceHost.Content = _workspaceGrid;

            // Subscribe once to preview changes to update notation
            _vm.Initialization.PropertyChanged += Initialization_PropertyChanged;
            _vm.PropertyChanged += MainViewModel_PropertyChanged;
            _vm.Store.CurrentLogEntries.CollectionChanged += (_, _) =>
                System.Windows.Application.Current.Dispatcher.BeginInvoke(
                    DispatcherPriority.Loaded,
                    new Action(() =>
                    {
                        if (TransformLogList.Items.Count == 0) return;
                        if (TransformLogList.SelectedIndex >= 0) return;
                        TransformLogList.SelectedIndex = TransformLogList.Items.Count - 1;
                        TransformLogList.ScrollIntoView(TransformLogList.SelectedItem);
                    }));
            UpdateNotation();
        }

        private void Initialization_PropertyChanged(object? sender, PropertyChangedEventArgs e)
        {
            // Guard: ensure notation exists
            if (_notation == null) return;
            try
            {
                if (e.PropertyName == nameof(InitializationViewModel.PreviewNode))
                {
                    UpdateNotation();
                }
            }
            catch
            {
                // swallow WebView errors so selection changes stay safe
            }
        }

        private void MainViewModel_PropertyChanged(object? sender, PropertyChangedEventArgs e)
        {
            if (e.PropertyName == nameof(MainViewModel.SelectedAccidentalRule))
            {
                UpdateNotation();
            }
        }

        private void UpdateNotation()
        {
            if (_notation == null) return;
            var width = Math.Max(0, _notation.ActualWidth - 16);
            var height = Math.Max(0, _notation.ActualHeight - 16);
            if (width <= 0 || height <= 0) return;
            var node = _vm.Initialization.PreviewNode;
            if (node == null) return;
            var config = _vm.GetRealizationConfig();
            var pcs = node.Mode == PcMode.Ordered ? node.Ordered : node.Unordered;
            var midi = MusicUtils.RealizePcs(pcs, node.Modulus, node.Mode, config);
            _notation.RenderNode(
                node,
                _vm.SelectedAccidentalRule,
                "line",
                width: width,
                height: height,
                maxNotes: 16,
                clipToViewport: true,
                showOverflowIndicator: true,
                midiNotes: midi);
        }

        private void LensSelector_SelectionChanged(object sender, SelectionChangedEventArgs e)
        {
            if (LensSelectorList.SelectedItem is ListBoxItem item)
            {
                var tag = item.Tag?.ToString();
                if (string.Equals(tag, "Initialization", StringComparison.OrdinalIgnoreCase))
                {
                    ShowLens(_initView);
                }
            }
        }

        private void TransformLog_SelectionChanged(object sender, SelectionChangedEventArgs e)
        {
            if (TransformLogList.SelectedItem != null)
            {
                TransformLogList.ScrollIntoView(TransformLogList.SelectedItem);
            }
        }

        private void TransformLogList_Loaded(object sender, RoutedEventArgs e)
        {
            if (TransformLogList.Items.Count == 0) return;
            if (TransformLogList.SelectedIndex >= 0) return;
            TransformLogList.SelectedIndex = TransformLogList.Items.Count - 1;
            TransformLogList.ScrollIntoView(TransformLogList.SelectedItem);
            if (_transformLogSelectionHooked) return;
            _transformLogSelectionHooked = true;
            TransformLogList.ItemContainerGenerator.StatusChanged += TransformLogList_ItemContainerGeneratorStatusChanged;
        }

        private void TransformLogList_ItemContainerGeneratorStatusChanged(object? sender, EventArgs e)
        {
            if (TransformLogList.ItemContainerGenerator.Status != System.Windows.Controls.Primitives.GeneratorStatus.ContainersGenerated)
            {
                return;
            }
            if (TransformLogList.Items.Count == 0) return;
            var desired = _vm.SelectedLogEntry ?? TransformLogList.Items[TransformLogList.Items.Count - 1];
            if (!ReferenceEquals(TransformLogList.SelectedItem, desired))
            {
                TransformLogList.SelectedItem = desired;
                TransformLogList.ScrollIntoView(desired);
            }
        }

        private void Settings_Click(object sender, RoutedEventArgs e)
        {
            if (_settingsWindow != null)
            {
                _settingsWindow.Activate();
                return;
            }

            _settingsWindow = new SettingsWindow
            {
                Owner = this,
                DataContext = _vm
            };
            UiPersistenceHelper.ApplyWindowPlacement(_settingsWindow, _appSettings, "Settings", applySize: false);
            _settingsWindow.Closed += (_, _) =>
            {
                UiPersistenceHelper.SaveWindowPlacement(_settingsWindow, _appSettings, "Settings");
                _settingsService.Save(_appSettings);
                _settingsWindow = null;
            };
            _settingsWindow.Show();
        }

        private void OpenPresetPicker()
        {
            if (_presetPickerDialog != null)
            {
                _presetPickerDialog.Activate();
                return;
            }

            _presetPickerDialog = new PresetPickerDialog
            {
                Owner = this,
                DataContext = new PresetPickerViewModel(
                    _vm.PresetCatalog,
                    _vm.PresetState,
                    _vm.Initialization,
                    _vm.MidiService,
                    _vm.SelectedAccidentalRule,
                    _vm.GetRealizationConfig)
            };
            _presetPickerDialog.Initialize(_settingsService, _appSettings);
            _presetPickerDialog.Closed += (_, _) => _presetPickerDialog = null;
            _presetPickerDialog.ShowDialog();
        }

        private void OpenPitchListCatalog()
        {
            if (_pitchListCatalogWindow != null)
            {
                _pitchListCatalogWindow.Activate();
                return;
            }

            _pitchListCatalogWindow = new Views.PitchListCatalogWindow
            {
                Owner = this,
                DataContext = new PitchListCatalogViewModel(_vm.PresetCatalog, _vm.PresetState)
            };
            _pitchListCatalogWindow.Closed += (_, _) => _pitchListCatalogWindow = null;
            _pitchListCatalogWindow.Show();
        }

        private void ApplyWindowSettings()
        {
            var applied = UiPersistenceHelper.ApplyWindowPlacement(this, _appSettings, "Main");
            if (!applied)
            {
                if (_appSettings.WindowWidth > 0)
                    Width = _appSettings.WindowWidth;
                if (_appSettings.WindowHeight > 0)
                    Height = _appSettings.WindowHeight;
                if (_appSettings.WindowLeft.HasValue)
                    Left = _appSettings.WindowLeft.Value;
                if (_appSettings.WindowTop.HasValue)
                    Top = _appSettings.WindowTop.Value;
                if (Enum.TryParse(_appSettings.WindowState, true, out WindowState state))
                    WindowState = state;
            }

            if (_appSettings.InspectorPanelWidth > 0)
            {
                InspectorColumn.Width = new System.Windows.GridLength(_appSettings.InspectorPanelWidth);
            }
            UiPersistenceHelper.ApplyColumnWidth(CompositesColumn, _appSettings, "Main.Composites");
            UiPersistenceHelper.ApplyColumnWidth(LensSelectorColumn, _appSettings, "Main.LensSelector");
            UiPersistenceHelper.ApplyColumnWidth(TransformLogColumn, _appSettings, "Main.TransformLog");
            UiPersistenceHelper.ApplyColumnWidth(InspectorColumn, _appSettings, "Main.Inspector", _appSettings.InspectorPanelWidth);
        }

        private void MainWindow_Closing(object? sender, CancelEventArgs e)
        {
            if (_presetPickerDialog != null)
            {
                _presetPickerDialog.Close();
            }
            if (_settingsWindow != null)
            {
                _settingsWindow.Close();
            }
            _projectService.Save(_vm.Store.ToProjectData());
            UiPersistenceHelper.SaveWindowPlacement(this, _appSettings, "Main");
            _appSettings.WindowWidth = Width;
            _appSettings.WindowHeight = Height;
            _appSettings.WindowLeft = Left;
            _appSettings.WindowTop = Top;
            _appSettings.WindowState = WindowState.ToString();
            _appSettings.InspectorPanelWidth = InspectorColumn.ActualWidth;
            UiPersistenceHelper.SaveColumnWidth(CompositesColumn, _appSettings, "Main.Composites");
            UiPersistenceHelper.SaveColumnWidth(LensSelectorColumn, _appSettings, "Main.LensSelector");
            UiPersistenceHelper.SaveColumnWidth(TransformLogColumn, _appSettings, "Main.TransformLog");
            UiPersistenceHelper.SaveColumnWidth(InspectorColumn, _appSettings, "Main.Inspector");
            _settingsService.Save(_appSettings);
        }

        private void ShowLens(System.Windows.Controls.UserControl? lens)
        {
            if (lens == null) return;
            if (System.Windows.LogicalTreeHelper.GetParent(lens) is System.Windows.Controls.Panel prevPanel)
            {
                prevPanel.Children.Remove(lens);
            }
            if (_notation != null && System.Windows.LogicalTreeHelper.GetParent(_notation) is System.Windows.Controls.Panel notationParent && notationParent != _workspaceGrid)
            {
                notationParent.Children.Remove(_notation);
            }
            _workspaceGrid.Children.Clear();
            System.Windows.Controls.Grid.SetRow(lens, 0);
            _workspaceGrid.Children.Add(lens);
            if (_notation != null)
            {
                System.Windows.Controls.Grid.SetRow(_notation, 1);
                _workspaceGrid.Children.Add(_notation);
            }
            WorkspaceHost.Content = _workspaceGrid;
        }

        private string EnsureProjectFolder()
        {
            if (!string.IsNullOrWhiteSpace(_appSettings.ProjectPath) && Directory.Exists(_appSettings.ProjectPath))
            {
                return _appSettings.ProjectPath;
            }

            using var dialog = new System.Windows.Forms.FolderBrowserDialog
            {
                Description = "Select a project folder for Composition Toolbox",
                UseDescriptionForTitle = true,
                ShowNewFolderButton = true
            };
            var result = dialog.ShowDialog();
            var selected = result == System.Windows.Forms.DialogResult.OK && Directory.Exists(dialog.SelectedPath)
                ? dialog.SelectedPath
                : Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.MyDocuments), "Composition Toolbox Project");

            _appSettings.ProjectPath = selected;
            _settingsService.Save(_appSettings);
            return selected;
        }
    }
}
