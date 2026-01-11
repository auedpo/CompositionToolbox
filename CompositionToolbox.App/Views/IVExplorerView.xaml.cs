// Purpose: Code-behind for the IV Explorer View view that wires inputs into its view model.

using System.Windows.Input;
using CompositionToolbox.App.ViewModels;

namespace CompositionToolbox.App.Views
{
    public partial class IVExplorerView : System.Windows.Controls.UserControl
    {
        public IVExplorerView()
        {
            InitializeComponent();
        }

        private void ResultsGrid_MouseDoubleClick(object sender, MouseButtonEventArgs e)
        {
            if (DataContext is IVExplorerViewModel vm && vm.CommitSelectedCommand.CanExecute(null))
            {
                vm.CommitSelectedCommand.Execute(null);
            }
        }

        private void ResultsGrid_PreviewKeyDown(object sender, System.Windows.Input.KeyEventArgs e)
        {
            if (e.Key == Key.Enter && DataContext is IVExplorerViewModel vm && vm.CommitSelectedCommand.CanExecute(null))
            {
                vm.CommitSelectedCommand.Execute(null);
                e.Handled = true;
            }
        }
    }
}
