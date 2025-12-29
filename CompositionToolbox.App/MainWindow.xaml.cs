using System;
using System.ComponentModel;
using System.Windows;
using CompositionToolbox.App.Models;
using CompositionToolbox.App.Services;
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
        private readonly System.Windows.Controls.Grid _workspaceGrid = new();
        private readonly SettingsService _settingsService;
        private readonly AppSettings _appSettings;

        public MainWindow()
        {
            InitializeComponent();
            _settingsService = new SettingsService();
            _appSettings = _settingsService.Load();
            DataContext = new MainViewModel(_settingsService, _appSettings);
            _vm = (MainViewModel)DataContext;
            _vm.PresetPickerRequested += (_, _) => OpenPresetPicker();
            _vm.RealizationConfigChanged += (_, _) =>
            {
                UpdateNotation();
                _vm.Inspector.RefreshRealization();
                if (_presetPickerDialog?.DataContext is PresetPickerViewModel presetVm)
                {
                    presetVm.RefreshRealization();
                }
            };
            if (Application.Current is App app)
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
            UpdateNotation();

            // mark Initialization button as active visually
            SetActiveLensButton(InitializationButton);
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

        private void Initialization_Click(object sender, RoutedEventArgs e)
        {
            ShowLens(_initView);
            SetActiveLensButton(InitializationButton);
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
            UiPersistenceHelper.ApplyColumnWidth(LensesColumn, _appSettings, "Main.Lenses");
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
            UiPersistenceHelper.SaveWindowPlacement(this, _appSettings, "Main");
            _appSettings.WindowWidth = Width;
            _appSettings.WindowHeight = Height;
            _appSettings.WindowLeft = Left;
            _appSettings.WindowTop = Top;
            _appSettings.WindowState = WindowState.ToString();
            _appSettings.InspectorPanelWidth = InspectorColumn.ActualWidth;
            UiPersistenceHelper.SaveColumnWidth(LensesColumn, _appSettings, "Main.Lenses");
            UiPersistenceHelper.SaveColumnWidth(TransformLogColumn, _appSettings, "Main.TransformLog");
            UiPersistenceHelper.SaveColumnWidth(InspectorColumn, _appSettings, "Main.Inspector");
            _settingsService.Save(_appSettings);
        }

        private void SetActiveLensButton(System.Windows.Controls.Button? active)
        {
            // reset all lens buttons
            InitializationButton.Background = System.Windows.SystemColors.ControlBrush;
            SetButton.Background = System.Windows.SystemColors.ControlBrush;
            OrderButton.Background = System.Windows.SystemColors.ControlBrush;
            IntervalsButton.Background = System.Windows.SystemColors.ControlBrush;
            SymmetryButton.Background = System.Windows.SystemColors.ControlBrush;
            MatrixButton.Background = System.Windows.SystemColors.ControlBrush;
            ComposeButton.Background = System.Windows.SystemColors.ControlBrush;

            if (active != null)
            {
                active.Background = System.Windows.SystemColors.HighlightBrush;
            }
        }
    }
}
