using System.Windows.Input;
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
                vm.CommitSelectedCommand.Execute(null);
            }
        }

        private void ResultsGrid_PreviewKeyDown(object sender, System.Windows.Input.KeyEventArgs e)
        {
            if (e.Key == Key.Enter && DataContext is FocusAffineLensViewModel vm && vm.CommitSelectedCommand.CanExecute(null))
            {
                vm.CommitSelectedCommand.Execute(null);
                e.Handled = true;
            }
        }
    }
}
