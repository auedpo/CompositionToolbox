// Purpose: Code-behind for the Focus Affine View view that wires inputs into its view model.

using System.Windows;
using System.Windows.Controls;
using System.Windows.Data;
using System.Windows.Input;
using System.Windows.Media;
using CompositionToolbox.App.ViewModels;

namespace CompositionToolbox.App.Views
{
    public partial class FocusAffineView : System.Windows.Controls.UserControl
    {
        public FocusAffineView()
        {
            InitializeComponent();
        }

        private void ResultsGrid_MouseDoubleClick(object sender, MouseButtonEventArgs e)
        {
            if (DataContext is FocusAffineLensViewModel vm && vm.CommitSelectedCommand.CanExecute(null))
            {
                var isOffsets = IsOffsetsColumn(e.OriginalSource as DependencyObject);
                vm.SetPreviewMode(isOffsets ? FocusAffinePreviewMode.Offsets : FocusAffinePreviewMode.Outputs);

                if (isOffsets)
                {
                    vm.CommitSelectedOffsets();
                    return;
                }

                vm.CommitSelectedCommand.Execute(null);
            }
        }

        private void ResultsGrid_PreviewMouseLeftButtonDown(object sender, MouseButtonEventArgs e)
        {
            if (DataContext is not FocusAffineLensViewModel vm)
            {
                return;
            }

            var mode = IsOffsetsColumn(e.OriginalSource as DependencyObject)
                ? FocusAffinePreviewMode.Offsets
                : FocusAffinePreviewMode.Outputs;
            vm.SetPreviewMode(mode);
        }

        private void ResultsGrid_PreviewKeyDown(object sender, System.Windows.Input.KeyEventArgs e)
        {
            if (e.Key == Key.Enter && DataContext is FocusAffineLensViewModel vm && vm.CommitSelectedCommand.CanExecute(null))
            {
                var grid = sender as DataGrid;
                var isOffsets = IsOffsetsColumn(grid?.CurrentCell.Column);
                vm.SetPreviewMode(isOffsets ? FocusAffinePreviewMode.Offsets : FocusAffinePreviewMode.Outputs);

                if (isOffsets)
                {
                    vm.CommitSelectedOffsets();
                }
                else
                {
                    vm.CommitSelectedCommand.Execute(null);
                }

                e.Handled = true;
            }
        }

        private static bool IsOffsetsColumn(DependencyObject? source)
        {
            var cell = FindVisualParent<DataGridCell>(source);
            return IsOffsetsColumn(cell?.Column);
        }

        private static bool IsOffsetsColumn(DataGridColumn? column)
        {
            if (column is DataGridTextColumn textColumn
                && textColumn.Binding is System.Windows.Data.Binding binding
                && binding.Path?.Path == "OffsetsDisplay")
            {
                return true;
            }

            return false;
        }

        private static T? FindVisualParent<T>(DependencyObject? child) where T : DependencyObject
        {
            var current = child;
            while (current != null)
            {
                if (current is T match)
                {
                    return match;
                }
                current = VisualTreeHelper.GetParent(current);
            }
            return null;
        }
    }
}
