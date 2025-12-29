using System.Windows.Controls;
using System.Windows.Input;
using System.Windows;
using CompositionToolbox.App.ViewModels;

namespace CompositionToolbox.App.Views
{
    public partial class InitializationView : UserControl
    {
        public InitializationView()
        {
            InitializeComponent();
        }

        private void RandomPermutationRadio_PreviewMouseLeftButtonDown(object sender, MouseButtonEventArgs e)
        {
            if (sender is RadioButton { IsChecked: true } && DataContext is InitializationViewModel vm)
            {
                if (vm.RandomizeSeedCommand.CanExecute(null))
                {
                    vm.RandomizeSeedCommand.Execute(null);
                }
                e.Handled = true;
            }
        }

        private void RandomRotationRadio_PreviewMouseLeftButtonDown(object sender, MouseButtonEventArgs e)
        {
            if (sender is RadioButton { IsChecked: true } && DataContext is InitializationViewModel vm)
            {
                if (vm.RandomizeRotationCommand.CanExecute(null))
                {
                    vm.RandomizeRotationCommand.Execute(null);
                }
                e.Handled = true;
            }
        }

        private void PresetItem_Click(object sender, RoutedEventArgs e)
        {
            RecentsExpander.IsExpanded = false;
            InputBox.Focus();
            InputBox.SelectionStart = InputBox.Text?.Length ?? 0;
            InputBox.SelectionLength = 0;
        }
    }
}
