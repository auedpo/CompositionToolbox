using System;
using System.ComponentModel;
using System.IO;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using System.Windows.Controls.Primitives;
using System.Diagnostics;
using CompositionToolbox.App.Models;
using CompositionToolbox.App.Services;
using CompositionToolbox.App.Stores;
using CompositionToolbox.App.Utilities;
using CompositionToolbox.App.ViewModels;
using CompositionToolbox.App.Views;

namespace CompositionToolbox.App
{
    public partial class MainWindow : Window
    {
        public static readonly RoutedUICommand ShowTransformLogDetailsCommand =
            new RoutedUICommand("Show Transform Log Details", nameof(ShowTransformLogDetailsCommand), typeof(MainWindow));

        private static readonly Dictionary<string, string> TransformLogColumnKeys = new()
        {
            ["Step"] = "Main.TransformLog.Column.Step",
            ["Op"] = "Main.TransformLog.Column.Op",
            ["Badge"] = "Main.TransformLog.Column.Badge",
            ["PitchList"] = "Main.TransformLog.Column.PitchList"
        };

        private readonly MainViewModel _vm;
        private NotationView? _notation;
        private InitializationView? _initView;
        private IVExplorerView? _ivExplorerView;
        private IVExplorerViewModel? _ivExplorerViewModel;
        private FocusAffineView? _focusAffineView;
        private FocusAffineLensViewModel? _focusAffineViewModel;
        private AcdlLensView? _acdlView;
        private AcdlLensViewModel? _acdlViewModel;
        private GapToPcView? _gapToPcView;
        private GapToPcViewModel? _gapToPcViewModel;
        private NecklaceEntryLensView? _necklaceEntryView;
        private NecklaceEntryLensViewModel? _necklaceEntryViewModel;
        private SwirlingMistsLensView? _swirlingMistsView;
        private SwirlingMistsLensViewModel? _swirlingMistsViewModel;
        private TestLensView? _testLensView;
        private SettingsWindow? _settingsWindow;
        private Views.PitchListCatalogWindow? _pitchListCatalogWindow;
        private PitchListCatalogViewModel? _pitchListCatalogViewModel;
        private Views.MidiMonitorWindow? _midiMonitorWindow;
        private TransformLogDetailsWindow? _transformLogDetailsWindow;
        private readonly SettingsService _settingsService;
        private readonly AppSettings _appSettings;
        private readonly ProjectService _projectService;
        private readonly DragOutFileService _dragOutFileService;
        private readonly IMidiExportService _midiExportService;
        private bool _transformLogSelectionHooked;
        private bool _transformLogColumnWidthsHooked;
        private ILensPreviewSource? _activeLensPreview;
        private ILensActivation? _activeLensActivation;
        private System.Windows.Point _dragStartPoint;
        private bool _dragPending;
        private CompositeSnapshot? _dragSnapshot;
        private MidiExportOptions? _dragOptions;
        private const double CompositesCollapsedWidth = 35;
        private const int CompositesSlideMs = 150;
        private double _compositesExpandedWidth = 220;
        private bool _compositesPinned = true;
        private bool _compositesMenuOpen;
        private System.Windows.Threading.DispatcherTimer? _compositesCollapseTimer;

        public static readonly DependencyProperty IsCompositesCollapsedProperty =
            DependencyProperty.Register(nameof(IsCompositesCollapsed), typeof(bool), typeof(MainWindow), new PropertyMetadata(false));

        public bool IsCompositesCollapsed
        {
            get => (bool)GetValue(IsCompositesCollapsedProperty);
            set => SetValue(IsCompositesCollapsedProperty, value);
        }

        public MainWindow()
        {
            InitializeComponent();
            Loaded += MainWindow_Loaded;
            _settingsService = new SettingsService();
            _appSettings = _settingsService.Load();
            var projectPath = EnsureProjectFolder();
            _projectService = new ProjectService(projectPath);
            _dragOutFileService = new DragOutFileService();
            _midiExportService = new MidiExportService(new NoteRealizer(), _dragOutFileService);
            var store = new CompositeStore();
            store.Load(_projectService.LoadOrCreate());
            DataContext = new MainViewModel(_settingsService, _appSettings, store, _projectService);
            _vm = (MainViewModel)DataContext;
            _vm.PitchListCatalogRequested += (_, _) => OpenPitchListCatalog();
            _vm.PitchListCatalogModalRequested += (_, _) => OpenPitchListCatalogModal();
            _vm.RealizationConfigChanged += (_, _) =>
            {
                UpdateNotation();
                _vm.Inspector.RefreshRealization();
            };
            if (System.Windows.Application.Current is App app)
            {
                app.InitializeServices(_settingsService, _appSettings);
            }

            _dragOutFileService.CleanupOldFilesAndQueuedDeletes();

            ApplyWindowSettings();
            Closing += MainWindow_Closing;

            // create and reuse the Initialization view
            _initView = new InitializationView { DataContext = _vm.Initialization };
            _gapToPcViewModel = new GapToPcViewModel(_vm.Store, () => _vm.SelectedModulus);
            _gapToPcView = new GapToPcView { DataContext = _gapToPcViewModel };
            _testLensView = new TestLensView();
            _notation = WorkspaceNotation;
            _notation.SizeChanged += (_, _) => UpdateNotation();
            WorkspaceHost.Content = _initView;
            HookLensPreview(_initView);
            ActivateLens(_initView);

            // Subscribe once to preview changes to update notation
            _vm.Initialization.PropertyChanged += Initialization_PropertyChanged;
            _vm.PropertyChanged += MainViewModel_PropertyChanged;
            UpdateNotation();

            // Start background precreation of PresetItemViewModels (off-thread, non-UI) so VM items are ready when user opens catalogs
            Task.Run(() => PresetItemCache.PrecreateAll(_vm.PresetCatalog, _vm.PresetState));
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
            else if (e.PropertyName == nameof(MainViewModel.WorkspacePreview))
            {
                UpdateNotation();
            }
            else if (e.PropertyName == nameof(MainViewModel.WorkspacePreviewNotationMode))
            {
                UpdateNotation();
            }
            else if (e.PropertyName == nameof(MainViewModel.SelectedModulus))
            {
                _gapToPcViewModel?.RefreshForModulusChange();
                _necklaceEntryViewModel?.RefreshForModulusChange();
            }
        }

        private void MainWindow_PreviewKeyDown(object sender, System.Windows.Input.KeyEventArgs e)
        {
            if (e.Key != Key.V || Keyboard.Modifiers != ModifierKeys.None)
            {
                return;
            }

            if (ShortcutGuard.IsCaretAvailable(Keyboard.FocusedElement as DependencyObject))
            {
                return;
            }

            if (_vm.PlayWorkspacePreviewCommand.CanExecute(null))
            {
                _vm.PlayWorkspacePreviewCommand.Execute(null);
                e.Handled = true;
            }
        }

        private void UpdateNotation()
        {
            if (_notation == null) return;
            var width = Math.Max(0, _notation.ActualWidth - 16);
            var height = Math.Max(0, _notation.ActualHeight - 16);
            if (width <= 0 || height <= 0) return;
            var preview = _vm.WorkspacePreview;
            var node = preview?.Node ?? _vm.Initialization.PreviewNode;
            if (node == null) return;
            var isChord = _vm.WorkspacePreviewNotationMode == NotationPreference.Chord;
            var renderMode = isChord ? "chord" : "line";
            var mode = isChord ? PcMode.Unordered : PcMode.Ordered;
            var pcs = isChord
                ? (node.Mode == PcMode.Unordered ? node.Unordered : MusicUtils.NormalizeUnordered(node.Ordered, node.Modulus))
                : (node.Mode == PcMode.Ordered ? node.Ordered : node.Unordered);
            var config = _vm.GetRealizationConfig();
            var midi = MusicUtils.RealizePcs(pcs, node.Modulus, mode, config);
            var displayNode = new AtomicNode
            {
                Modulus = node.Modulus,
                Mode = mode,
                Ordered = pcs,
                Unordered = pcs,
                ValueType = node.ValueType,
                Label = node.Label,
                OpFromPrev = node.OpFromPrev
            };
            _notation.RenderNode(
                displayNode,
                _vm.SelectedAccidentalRule,
                renderMode,
                width: width,
                height: height,
                maxNotes: 16,
                clipToViewport: true,
                showOverflowIndicator: true,
                midiNotes: midi,
                useMidiForEdo19: true);
        }

        private void MainWindow_Loaded(object sender, RoutedEventArgs e)
        {
            _compositesExpandedWidth = Math.Max(CompositesColumn.ActualWidth, CompositesCollapsedWidth);
            _compositesPinned = _appSettings.IsCompositesPinned;
            CompositesPinToggle.IsChecked = _compositesPinned;
            if (!_compositesPinned)
            {
                CollapseCompositesPanel();
            }

            _compositesCollapseTimer = new System.Windows.Threading.DispatcherTimer
            {
                Interval = TimeSpan.FromMilliseconds(120)
            };
            _compositesCollapseTimer.Tick += (_, _) =>
            {
                _compositesCollapseTimer.Stop();
                if (_compositesPinned || _compositesMenuOpen || IsMouseInCompositesColumn())
                {
                    return;
                }
                CollapseCompositesPanel();
            };

            MouseMove += MainWindow_MouseMove;
            MouseLeave += MainWindow_MouseLeave;
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
                else if (string.Equals(tag, "IVExplorer", StringComparison.OrdinalIgnoreCase))
                {
                    if (_ivExplorerView == null)
                    {
                        _ivExplorerViewModel = new IVExplorerViewModel(_vm.Store);
                        _ivExplorerView = new IVExplorerView { DataContext = _ivExplorerViewModel };
                    }
                    ShowLens(_ivExplorerView);
                }
                else if (string.Equals(tag, "FocusAffine", StringComparison.OrdinalIgnoreCase))
                {
                    if (_focusAffineView == null)
                    {
                        _focusAffineViewModel = new FocusAffineLensViewModel(_vm.Store);
                        _focusAffineView = new FocusAffineView { DataContext = _focusAffineViewModel };
                    }
                    ShowLens(_focusAffineView);
                }
                else if (string.Equals(tag, "ACDL", StringComparison.OrdinalIgnoreCase))
                {
                    if (_acdlView == null)
                    {
                        _acdlViewModel = new AcdlLensViewModel(_vm.Store);
                        _acdlView = new AcdlLensView { DataContext = _acdlViewModel };
                    }
                    ShowLens(_acdlView);
                }
                else if (string.Equals(tag, "GapToPc", StringComparison.OrdinalIgnoreCase))
                {
                    ShowLens(_gapToPcView);
                }
                else if (string.Equals(tag, "NecklaceEntry", StringComparison.OrdinalIgnoreCase))
                {
                    if (_necklaceEntryView == null)
                    {
                        _necklaceEntryViewModel = new NecklaceEntryLensViewModel(_vm.Store, () => _vm.SelectedModulus);
                        _necklaceEntryView = new NecklaceEntryLensView { DataContext = _necklaceEntryViewModel };
                    }
                    ShowLens(_necklaceEntryView);
                }
                else if (string.Equals(tag, "SwirlingMists", StringComparison.OrdinalIgnoreCase))
                {
                    if (_swirlingMistsView == null)
                    {
                        _swirlingMistsViewModel = new SwirlingMistsLensViewModel();
                        _swirlingMistsView = new SwirlingMistsLensView { DataContext = _swirlingMistsViewModel };
                    }
                    ShowLens(_swirlingMistsView);
                }
                else if (string.Equals(tag, "Test", StringComparison.OrdinalIgnoreCase))
                {
                    ShowLens(_testLensView);
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
            if (!_transformLogColumnWidthsHooked)
            {
                _transformLogColumnWidthsHooked = true;
                ApplyTransformLogColumnWidths();
                ApplyTransformLogColumnOrder();
                TransformLogList.AddHandler(SizeChangedEvent, new SizeChangedEventHandler(TransformLogList_SizeChanged));
                TransformLogList.ColumnReordered += TransformLogList_ColumnReordered;
            }

            if (TransformLogList.Items.Count == 0) return;
            if (TransformLogList.SelectedIndex >= 0) return;
            TransformLogList.SelectedIndex = TransformLogList.Items.Count - 1;
            TransformLogList.ScrollIntoView(TransformLogList.SelectedItem);
            if (_transformLogSelectionHooked) return;
            _transformLogSelectionHooked = true;
            TransformLogList.ItemContainerGenerator.StatusChanged += TransformLogList_ItemContainerGeneratorStatusChanged;
        }

        private void TransformLogList_SizeChanged(object sender, SizeChangedEventArgs e)
        {
            if (e.OriginalSource is not DataGridColumnHeader header)
            {
                return;
            }

            var name = header.Column?.Header?.ToString() ?? string.Empty;
            if (!TransformLogColumnKeys.TryGetValue(name, out var key))
            {
                return;
            }

            var column = header.Column;
            if (column == null)
            {
                return;
            }

            if (column.ActualWidth > 0)
            {
                _appSettings.PanelWidths[key] = column.ActualWidth;
            }
        }

        private void ApplyTransformLogColumnWidths()
        {
            foreach (var column in TransformLogList.Columns)
            {
                var header = column.Header?.ToString() ?? string.Empty;
                if (!TransformLogColumnKeys.TryGetValue(header, out var key))
                {
                    continue;
                }

                if (_appSettings.PanelWidths.TryGetValue(key, out var width) && width > 0)
                {
                    column.Width = new DataGridLength(width, DataGridLengthUnitType.Pixel);
                }
            }
        }

        private void TransformLogList_ColumnReordered(object? sender, DataGridColumnEventArgs e)
        {
            foreach (var column in TransformLogList.Columns)
            {
                var header = column.Header?.ToString() ?? string.Empty;
                if (!TransformLogColumnKeys.TryGetValue(header, out var key))
                {
                    continue;
                }

                _appSettings.PanelOrders[key] = column.DisplayIndex;
            }
        }

        private void ApplyTransformLogColumnOrder()
        {
            if (_appSettings.PanelOrders.Count == 0) return;

            var ordered = TransformLogList.Columns
                .Select((column, idx) =>
                {
                    var header = column.Header?.ToString() ?? string.Empty;
                    var index = int.MaxValue;
                    if (TransformLogColumnKeys.TryGetValue(header, out var key)
                        && _appSettings.PanelOrders.TryGetValue(key, out var savedIndex))
                    {
                        index = savedIndex;
                    }
                    return new { column, index, idx };
                })
                .OrderBy(item => item.index)
                .ThenBy(item => item.idx)
                .ToList();

            var displayIndex = 0;
            foreach (var item in ordered)
            {
                item.column.DisplayIndex = displayIndex++;
            }
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

        private void TransformLogRow_PreviewMouseRightButtonDown(object sender, MouseButtonEventArgs e)
        {
            if (sender is DataGridRow row && !row.IsSelected)
            {
                row.IsSelected = true;
            }
        }

        private void TransformLogDetails_CanExecute(object sender, CanExecuteRoutedEventArgs e)
        {
            e.CanExecute = e.Parameter is CompositeTransformLogEntry;
            e.Handled = true;
        }

        private void TransformLogDetails_Executed(object sender, ExecutedRoutedEventArgs e)
        {
            if (e.Parameter is not CompositeTransformLogEntry entry)
            {
                return;
            }

            OpenTransformLogDetails(entry);
        }

        private void OpenTransformLogDetails(CompositeTransformLogEntry entry)
        {
            if (!ReferenceEquals(_vm.SelectedLogEntry, entry))
            {
                _vm.SelectedLogEntry = entry;
            }

            if (_transformLogDetailsWindow != null)
            {
                if (!_transformLogDetailsWindow.IsVisible)
                {
                    _transformLogDetailsWindow.Show();
                }
                _transformLogDetailsWindow.Activate();
                return;
            }

            _transformLogDetailsWindow = new TransformLogDetailsWindow
            {
                Owner = this,
                DataContext = _vm
            };
            _transformLogDetailsWindow.Closed += (_, _) => _transformLogDetailsWindow = null;
            _transformLogDetailsWindow.Show();
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

        private void MidiMonitor_Click(object sender, RoutedEventArgs e)
        {
            if (_midiMonitorWindow != null)
            {
                _midiMonitorWindow.Activate();
                return;
            }

            _midiMonitorWindow = new Views.MidiMonitorWindow(_vm.MidiService)
            {
                Owner = this
            };
            _midiMonitorWindow.Closed += (_, _) => _midiMonitorWindow = null;
            _midiMonitorWindow.Show();
        }

        private void Play_Click(object sender, RoutedEventArgs e)
        {
            _midiMonitorWindow?.ClearMessages();
        }

        private void MidiDragButton_PreviewMouseLeftButtonDown(object sender, MouseButtonEventArgs e)
        {
            _dragStartPoint = e.GetPosition(this);
            _dragPending = true;

            var renderMode = Keyboard.Modifiers.HasFlag(ModifierKeys.Shift)
                ? MidiRenderMode.Sequence
                : MidiRenderMode.Chord;

            _dragSnapshot = CompositeSnapshotFactory.CreateFromSelection(_vm.Store, _vm.GetRealizationConfig());
            if (_dragSnapshot == null)
            {
                _dragPending = false;
                _dragOptions = null;
                return;
            }

            _dragOptions = new MidiExportOptions
            {
                RenderMode = renderMode,
                PitchBendRangeSemitones = _appSettings.PitchBendRangeSemitones,
                UseMpeChannels = renderMode == MidiRenderMode.Chord
            };
        }

        private void MidiDragButton_PreviewMouseMove(object sender, System.Windows.Input.MouseEventArgs e)
        {
            if (!_dragPending || e.LeftButton != MouseButtonState.Pressed) return;

            var position = e.GetPosition(this);
            var deltaX = Math.Abs(position.X - _dragStartPoint.X);
            var deltaY = Math.Abs(position.Y - _dragStartPoint.Y);
            if (deltaX < SystemParameters.MinimumHorizontalDragDistance
                && deltaY < SystemParameters.MinimumVerticalDragDistance)
            {
                return;
            }

            _dragPending = false;
            var snapshot = _dragSnapshot;
            var options = _dragOptions;
            _dragSnapshot = null;
            _dragOptions = null;
            if (snapshot == null || options == null) return;

            string? tempPath = null;
            try
            {
                tempPath = _midiExportService.ExportToTempMidi(snapshot, options);
                var dataObject = new System.Windows.DataObject();
                dataObject.SetData(System.Windows.DataFormats.FileDrop, new[] { tempPath });
                DragDrop.DoDragDrop(MidiDragButton, dataObject, System.Windows.DragDropEffects.Copy);
            }
            catch (Exception ex)
            {
                DialogService.Warning(
                    "MIDI Export",
                    $"Unable to export MIDI: {ex.Message}");
            }
            finally
            {
                if (!string.IsNullOrWhiteSpace(tempPath))
                {
                    _dragOutFileService.TryDeleteOrQueue(tempPath);
                }
            }
        }

        private void MidiDragButton_PreviewMouseLeftButtonUp(object sender, MouseButtonEventArgs e)
        {
            _dragPending = false;
            _dragSnapshot = null;
            _dragOptions = null;
        }

        private void OpenPitchListCatalog()
        {
            EnsurePitchListCatalogReady();
            if (_pitchListCatalogWindow == null)
            {
                return;
            }
            if (!_pitchListCatalogWindow.IsVisible)
            {
                _pitchListCatalogWindow.Show();
            }
            _pitchListCatalogWindow.Activate();
        }

        private void OpenPitchListCatalogModal()
        {
            var modal = new Views.PitchListCatalogWindow
            {
                Owner = this,
                DataContext = new PitchListCatalogViewModel(_vm.PresetCatalog, _vm.PresetState, _vm.MidiService, _vm.SelectedAccidentalRule, _vm.GetRealizationConfig)
            };
            modal.ShowDialog();
        }

        /// <summary>
        /// Apply a preset to the Initialization input (called from catalog windows on selection).
        /// </summary>
        /// <param name="preset">The preset whose prime form will be applied to the input box.</param>
        public void ApplyPresetToInitialization(Models.PresetPcSet preset)
        {
            try
            {
                _initView?.ApplyPresetToInput(preset);
                // Bring main window to front so user sees the change
                try { Activate(); } catch { }
            }
            catch
            {
                // swallow to avoid bubbling UI exceptions from caller
            }
        }

        private void EnsurePitchListCatalogReady()
        {
            if (_pitchListCatalogWindow != null)
            {
                return;
            }

            _pitchListCatalogViewModel ??= new PitchListCatalogViewModel(_vm.PresetCatalog, _vm.PresetState, _vm.MidiService, _vm.SelectedAccidentalRule, _vm.GetRealizationConfig);
            _pitchListCatalogWindow = new Views.PitchListCatalogWindow
            {
                Owner = this,
                DataContext = _pitchListCatalogViewModel
            };
            _pitchListCatalogWindow.Closing += (_, e) =>
            {
                e.Cancel = true;
                _pitchListCatalogWindow.Hide();
            };
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

            UiPersistenceHelper.ApplyColumnWidth(CompositesColumn, _appSettings, "Main.Composites");
            ApplyStarColumnWidths();
            ApplyStarRowHeights();
        }

        private void MainWindow_Closing(object? sender, CancelEventArgs e)
        {
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
            UiPersistenceHelper.SaveColumnWidth(CompositesColumn, _appSettings, "Main.Composites");
            UiPersistenceHelper.SaveColumnWidth(MiddleColumn, _appSettings, "Main.Middle");
            UiPersistenceHelper.SaveColumnWidth(WorkspaceColumn, _appSettings, "Main.Workspace");
            UiPersistenceHelper.SaveColumnWidth(InspectorColumn, _appSettings, "Main.Inspector");
            if (!_compositesPinned && _compositesExpandedWidth > 0)
            {
                _appSettings.PanelWidths["Main.Composites"] = _compositesExpandedWidth;
            }
            _appSettings.IsCompositesPinned = _compositesPinned;
            _appSettings.PanelWidths["Main.LeftTop"] = LeftTopRow.ActualHeight;
            _appSettings.PanelWidths["Main.LeftBottom"] = LeftBottomRow.ActualHeight;
            _appSettings.PanelWidths["Main.InspectorTop"] = InspectorTopRow.ActualHeight;
            _appSettings.PanelWidths["Main.InspectorBottom"] = InspectorBottomRow.ActualHeight;
            _settingsService.Save(_appSettings);
        }

        private void ApplyStarColumnWidths()
        {
            if (!_appSettings.PanelWidths.TryGetValue("Main.Middle", out var middle) || middle <= 0)
            {
                return;
            }
            if (!_appSettings.PanelWidths.TryGetValue("Main.Workspace", out var workspace) || workspace <= 0)
            {
                return;
            }
            if (!_appSettings.PanelWidths.TryGetValue("Main.Inspector", out var inspector) || inspector <= 0)
            {
                return;
            }

            MiddleColumn.Width = new System.Windows.GridLength(middle, System.Windows.GridUnitType.Star);
            WorkspaceColumn.Width = new System.Windows.GridLength(workspace, System.Windows.GridUnitType.Star);
            InspectorColumn.Width = new System.Windows.GridLength(inspector, System.Windows.GridUnitType.Star);
        }

        private void ApplyStarRowHeights()
        {
            if (_appSettings.PanelWidths.TryGetValue("Main.LeftTop", out var leftTop) && leftTop > 0
                && _appSettings.PanelWidths.TryGetValue("Main.LeftBottom", out var leftBottom) && leftBottom > 0)
            {
                LeftTopRow.Height = new System.Windows.GridLength(leftTop, System.Windows.GridUnitType.Star);
                LeftBottomRow.Height = new System.Windows.GridLength(leftBottom, System.Windows.GridUnitType.Star);
            }

            if (_appSettings.PanelWidths.TryGetValue("Main.InspectorTop", out var inspectorTop) && inspectorTop > 0
                && _appSettings.PanelWidths.TryGetValue("Main.InspectorBottom", out var inspectorBottom) && inspectorBottom > 0)
            {
                InspectorTopRow.Height = new System.Windows.GridLength(inspectorTop, System.Windows.GridUnitType.Star);
                InspectorBottomRow.Height = new System.Windows.GridLength(inspectorBottom, System.Windows.GridUnitType.Star);
            }
        }

        private void MainWindow_MouseMove(object sender, System.Windows.Input.MouseEventArgs e)
        {
            UpdateCompositesHoverState();
        }

        private void MainWindow_MouseLeave(object sender, System.Windows.Input.MouseEventArgs e)
        {
            if (_compositesPinned || _compositesMenuOpen)
            {
                return;
            }
            _compositesCollapseTimer?.Stop();
            _compositesCollapseTimer?.Start();
        }

        private void CompositesPinToggle_Checked(object sender, RoutedEventArgs e)
        {
            _compositesPinned = true;
            ExpandCompositesPanel();
        }

        private void CompositesPinToggle_Unchecked(object sender, RoutedEventArgs e)
        {
            _compositesPinned = false;
            CollapseCompositesPanel();
        }

        private void CompositeActionsSelector_DropDownOpened(object sender, EventArgs e)
        {
            _compositesMenuOpen = true;
            _compositesCollapseTimer?.Stop();
            if (!_compositesPinned)
            {
                ExpandCompositesPanel();
            }
        }

        private void CompositeActionsSelector_DropDownClosed(object sender, EventArgs e)
        {
            _compositesMenuOpen = false;
            if (_compositesPinned) return;
            UpdateCompositesHoverState();
        }

        private void UpdateCompositesHoverState()
        {
            if (_compositesPinned || _compositesMenuOpen)
            {
                return;
            }

            if (IsMouseInCompositesColumn())
            {
                _compositesCollapseTimer?.Stop();
                ExpandCompositesPanel();
                return;
            }

            _compositesCollapseTimer?.Stop();
            _compositesCollapseTimer?.Start();
        }

        private bool IsMouseInCompositesColumn()
        {
            if (CompositesLensGrid == null)
            {
                return false;
            }

            var position = System.Windows.Input.Mouse.GetPosition(CompositesLensGrid);
            return position.X >= 0 && position.X <= CompositesColumn.ActualWidth;
        }

        private void ExpandCompositesPanel()
        {
            var targetWidth = Math.Max(_compositesExpandedWidth, CompositesCollapsedWidth);
            AnimateCompositesWidth(targetWidth);
            IsCompositesCollapsed = false;
        }

        private void CollapseCompositesPanel()
        {
            _compositesExpandedWidth = Math.Max(CompositesColumn.ActualWidth, _compositesExpandedWidth);
            AnimateCompositesWidth(CompositesCollapsedWidth);
            IsCompositesCollapsed = true;
        }

        private void AnimateCompositesWidth(double targetWidth)
        {
            var animation = new GridLengthAnimation
            {
                From = CompositesColumn.Width,
                To = new GridLength(targetWidth, GridUnitType.Pixel),
                Duration = TimeSpan.FromMilliseconds(CompositesSlideMs)
            };
            CompositesColumn.BeginAnimation(ColumnDefinition.WidthProperty, animation);
        }

        private void CompositeActions_SelectionChanged(object sender, SelectionChangedEventArgs e)
        {
            if (CompositeActionsSelector.SelectedItem is not ComboBoxItem item)
            {
                return;
            }

            var tag = item.Tag?.ToString();
            if (string.Equals(tag, "None", StringComparison.OrdinalIgnoreCase))
            {
                return;
            }

            if (string.Equals(tag, "New", StringComparison.OrdinalIgnoreCase))
            {
                _vm.NewCompositeCommand.Execute(null);
            }
            else if (string.Equals(tag, "Duplicate", StringComparison.OrdinalIgnoreCase))
            {
                _vm.DuplicateCompositeCommand.Execute(null);
            }
            else if (string.Equals(tag, "Rename", StringComparison.OrdinalIgnoreCase))
            {
                _vm.RenameCompositeCommand.Execute(null);
            }
            else if (string.Equals(tag, "Delete", StringComparison.OrdinalIgnoreCase))
            {
                _vm.DeleteCompositeCommand.Execute(null);
            }

            CompositeActionsSelector.SelectedIndex = 0;
        }

        private void ShowLens(System.Windows.Controls.UserControl? lens)
        {
            if (lens == null) return;
            if (System.Windows.LogicalTreeHelper.GetParent(lens) is System.Windows.Controls.Panel prevPanel)
            {
                prevPanel.Children.Remove(lens);
            }
            WorkspaceHost.Content = lens;
            HookLensPreview(lens);
            ActivateLens(lens);
        }

        private void HookLensPreview(object? lens)
        {
            if (_activeLensPreview != null)
            {
                _activeLensPreview.PropertyChanged -= ActiveLensPreview_PropertyChanged;
            }

            _activeLensPreview = null;
            if (lens is FrameworkElement element && element.DataContext is ILensPreviewSource source)
            {
                _activeLensPreview = source;
                _activeLensPreview.PropertyChanged += ActiveLensPreview_PropertyChanged;
                PushWorkspacePreview(source.WorkspacePreview);
            }
        }

        private void ActivateLens(object? lens)
        {
            if (_activeLensActivation != null)
            {
                _activeLensActivation.Deactivate();
            }

            _activeLensActivation = null;
            if (lens is FrameworkElement element && element.DataContext is ILensActivation activatable)
            {
                _activeLensActivation = activatable;
                _activeLensActivation.Activate();
            }
        }

        private void ActiveLensPreview_PropertyChanged(object? sender, PropertyChangedEventArgs e)
        {
            if (e.PropertyName == nameof(ILensPreviewSource.WorkspacePreview) || string.IsNullOrEmpty(e.PropertyName))
            {
                PushWorkspacePreview(_activeLensPreview?.WorkspacePreview);
            }
        }

        private void PushWorkspacePreview(WorkspacePreview? preview)
        {
            if (preview == null) return;
            _vm.SetWorkspacePreview(preview);
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
