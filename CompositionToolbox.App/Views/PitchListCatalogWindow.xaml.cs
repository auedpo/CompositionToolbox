using System.Windows;
using System.Diagnostics;
using CompositionToolbox.App.Services;
using System.Windows.Input;
using CompositionToolbox.App.Models;

namespace CompositionToolbox.App.Views
{
    public partial class PitchListCatalogWindow : Window
    {
        private Stopwatch? _ctorStopwatch;
        private ViewModels.PitchListCatalogViewModel? _vm;
        public PitchListCatalogWindow()
        {
            _ctorStopwatch = Stopwatch.StartNew();
            InitializeComponent();
            Loaded += PitchListCatalogWindow_Loaded;
            DataContextChanged += PitchListCatalogWindow_DataContextChanged;
            PreviewNotation.SizeChanged += PreviewNotation_SizeChanged;
        }

        private void PitchListCatalogWindow_Loaded(object sender, RoutedEventArgs e)
        {
            if (_ctorStopwatch != null)
            {
                _ctorStopwatch.Stop();
                TimingLogger.Log($"PitchListCatalogWindow: Loaded after {_ctorStopwatch.ElapsedMilliseconds}ms; ResultsGrid.Items={ResultsGrid?.Items.Count}");

                // Schedule a post-render log at Render priority so we can inspect how many item containers were realized.
                var loadElapsed = _ctorStopwatch.ElapsedMilliseconds;
                Dispatcher.BeginInvoke(new Action(() =>
                {
                    try
                    {
                        TimingLogger.Log("PitchListCatalogWindow: PostRender invoked");
                        int visibleContainers = 0;
                        if (ResultsGrid != null)
                        {
                            var gen = ResultsGrid.ItemContainerGenerator;
                            for (int i = 0; i < ResultsGrid.Items.Count; i++)
                            {
                                var container = gen.ContainerFromIndex(i);
                                if (container != null) visibleContainers++;
                                else break; // containers are contiguous from the top — stop on first null to make this cheap
                            }
                        }
                        TimingLogger.Log($"PitchListCatalogWindow: PostRender after {loadElapsed}ms; VisibleContainers={visibleContainers}; Items={ResultsGrid?.Items.Count}");
                    }
                    catch (Exception ex)
                    {
                        TimingLogger.Log($"PitchListCatalogWindow: PostRender logging failed: {ex.Message}");
                    }
                }), System.Windows.Threading.DispatcherPriority.Render);
            }
        }

        private void ResultsGrid_MouseDoubleClick(object sender, MouseButtonEventArgs e)
        {
            // Apply on double-click (existing behavior)
            TryApplySelectedPresetToInitialization();
        }

        private void PitchListCatalogWindow_DataContextChanged(object sender, DependencyPropertyChangedEventArgs e)
        {
            if (_vm != null)
            {
                _vm.PropertyChanged -= Vm_PropertyChanged;
            }

            _vm = DataContext as ViewModels.PitchListCatalogViewModel;
            if (_vm != null)
            {
                _vm.PropertyChanged += Vm_PropertyChanged;
            }

            RenderNotation();
        }

        private void Vm_PropertyChanged(object? sender, System.ComponentModel.PropertyChangedEventArgs e)
        {
            if (e.PropertyName == nameof(ViewModels.PitchListCatalogViewModel.PreviewNode)
                || e.PropertyName == nameof(ViewModels.PitchListCatalogViewModel.NotationRenderMode)
                || e.PropertyName == nameof(ViewModels.PitchListCatalogViewModel.AccidentalRule)
                || e.PropertyName == nameof(ViewModels.PitchListCatalogViewModel.PreviewMidiNotes))
            {
                RenderNotation();
            }
        }

        private void RenderNotation()
        {
            if (_vm == null) return;
            var width = Math.Max(0, PreviewNotation.ActualWidth - 16);
            var height = Math.Max(0, PreviewNotation.ActualHeight - 16);
            if (width <= 0 || height <= 0) return;
            PreviewNotation.RenderNode(
                _vm.PreviewNode,
                _vm.AccidentalRule,
                _vm.NotationRenderMode,
                width: width,
                height: height,
                maxNotes: 16,
                clipToViewport: true,
                showOverflowIndicator: true,
                midiNotes: _vm.PreviewMidiNotes);
        }

        private void PreviewNotation_SizeChanged(object sender, SizeChangedEventArgs e)
        {
            RenderNotation();
        }

        private void ResultsGrid_PreviewKeyDown(object sender, System.Windows.Input.KeyEventArgs e)
        {
            if (e.Key == Key.Enter)
            {
                TryApplySelectedPresetToInitialization();
                e.Handled = true;
            }
        }

        private void TryApplySelectedPresetToInitialization()
        {
            if (DataContext is ViewModels.PitchListCatalogViewModel vm)
            {
                PresetPcSet? preset = null;
                if (vm.SelectedPreset is ViewModels.PresetItemViewModel piv) preset = piv.Preset;
                else if (vm.SelectedPreset is PresetPcSet p) preset = p;

                if (preset != null)
                {
                    // Attempt to find the main window and apply the preset to the initialization input
                    if (Owner is MainWindow main)
                    {
                        main.ApplyPresetToInitialization(preset);
                    }
                    else if (System.Windows.Application.Current?.MainWindow is MainWindow main2)
                    {
                        main2.ApplyPresetToInitialization(preset);
                    }

                    // Close this catalog window so the user returns to the Initialization view
                    try { Close(); } catch { }
                }
            }
        }
    }
}
