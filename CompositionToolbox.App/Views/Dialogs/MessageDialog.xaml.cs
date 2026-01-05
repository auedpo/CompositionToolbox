using System.Windows;

namespace CompositionToolbox.App.Views.Dialogs
{
    public partial class MessageDialog : Window
    {
        public MessageDialog()
        {
            InitializeComponent();
        }

        public string Message
        {
            get => MessageText.Text;
            set => MessageText.Text = value;
        }

        private void Ok_Click(object sender, RoutedEventArgs e)
        {
            DialogResult = true;
        }
    }
}
