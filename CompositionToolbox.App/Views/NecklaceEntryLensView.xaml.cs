// Purpose: Code-behind for the Necklace Entry Lens View view that wires inputs into its view model.

using System;
using System.Windows;
using System.Windows.Input;
using CompositionToolbox.App.ViewModels;

namespace CompositionToolbox.App.Views
{
    public partial class NecklaceEntryLensView : System.Windows.Controls.UserControl
    {
        private NecklaceEntryLensViewModel? _viewModel;
        private int _layoutAttempts;

        public NecklaceEntryLensView()
        {
            InitializeComponent();
            DataContextChanged += OnDataContextChanged;
            Loaded += NecklaceEntryLensView_Loaded;
        }

        private void NecklaceEntryLensView_Loaded(object sender, RoutedEventArgs e)
        {
            _layoutAttempts = 0;
            Focus();
            PushViewportSize();
        }

        private void NecklaceEntryLensView_PreviewKeyDown(object sender, System.Windows.Input.KeyEventArgs e)
        {
            if (_viewModel == null) return;

            if (e.Key == Key.Back)
            {
                if (_viewModel.BackspaceCommand.CanExecute(null))
                {
                    _viewModel.BackspaceCommand.Execute(null);
                }
                e.Handled = true;
            }
            else if (e.Key == Key.Escape)
            {
                if (_viewModel.ClearCommand.CanExecute(null))
                {
                    _viewModel.ClearCommand.Execute(null);
                }
                e.Handled = true;
            }
            else if (e.Key == Key.Enter)
            {
                if (_viewModel.CommitCommand.CanExecute(null))
                {
                    _viewModel.CommitCommand.Execute(null);
                }
                e.Handled = true;
            }
        }

        private void NecklaceEntryLensView_SizeChanged(object sender, SizeChangedEventArgs e)
        {
            PushViewportSize();
        }

        private void NecklaceHost_Loaded(object sender, RoutedEventArgs e)
        {
            PushViewportSize();
        }

        private void NecklaceHost_SizeChanged(object sender, SizeChangedEventArgs e)
        {
            PushViewportSize();
        }

        private void NecklaceNode_MouseLeftButtonDown(object sender, MouseButtonEventArgs e)
        {
            if (sender is FrameworkElement element && element.DataContext is NecklaceNodeViewModel node)
            {
                if (_viewModel?.TogglePcCommand.CanExecute(node.Pc) == true)
                {
                    _viewModel.TogglePcCommand.Execute(node.Pc);
                    e.Handled = true;
                }
            }
        }

        private void OnDataContextChanged(object sender, DependencyPropertyChangedEventArgs e)
        {
            _viewModel = DataContext as NecklaceEntryLensViewModel;
            PushViewportSize();
        }

        private void PushViewportSize()
        {
            if (_viewModel == null || NecklaceHost == null) return;
            var width = NecklaceHost.ActualWidth;
            var height = NecklaceHost.ActualHeight;
            if (width <= 0 || height <= 0)
            {
                if (NecklaceFrame != null)
                {
                    width = Math.Max(width, NecklaceFrame.ActualWidth);
                    height = Math.Max(height, NecklaceFrame.ActualHeight);
                }
                width = Math.Max(width, ActualWidth);
                height = Math.Max(height, ActualHeight);
            }

            if (width <= 0 || height <= 0)
            {
                if (_layoutAttempts < 5)
                {
                    _layoutAttempts++;
                    Dispatcher.BeginInvoke(new Action(PushViewportSize), System.Windows.Threading.DispatcherPriority.Loaded);
                }
                return;
            }

            _layoutAttempts = 0;
            _viewModel.SetViewportSize(width, height);
        }
    }
}
