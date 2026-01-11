// Purpose: Dialog logic that backs the Confirm Dialog prompt's interactions and results.

using System.Windows;

namespace CompositionToolbox.App.Views.Dialogs
{
    public partial class ConfirmDialog : Window
    {
        public ConfirmDialog()
        {
            InitializeComponent();
        }

        public string Message
        {
            get => MessageText.Text;
            set => MessageText.Text = value;
        }

        private void Yes_Click(object sender, RoutedEventArgs e)
        {
            DialogResult = true;
        }
    }
}
