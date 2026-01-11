// Purpose: Dialog logic that backs the Text Prompt Dialog prompt's interactions and results.

using System.Windows;

namespace CompositionToolbox.App.Views.Dialogs
{
    public partial class TextPromptDialog : Window
    {
        public TextPromptDialog()
        {
            InitializeComponent();
            DataContext = this;
            Loaded += (_, _) => InputTextBox.Focus();
            ContentRendered += (_, _) =>
            {
                Dispatcher.BeginInvoke(() => InputTextBox.SelectAll(),
                    System.Windows.Threading.DispatcherPriority.Input);
            };
        }

        public static readonly DependencyProperty PromptProperty =
            DependencyProperty.Register(nameof(Prompt), typeof(string), typeof(TextPromptDialog), new PropertyMetadata(string.Empty));

        public static readonly DependencyProperty ResponseTextProperty =
            DependencyProperty.Register(nameof(ResponseText), typeof(string), typeof(TextPromptDialog), new PropertyMetadata(string.Empty));

        public string Prompt
        {
            get => (string)GetValue(PromptProperty);
            set => SetValue(PromptProperty, value);
        }

        public string ResponseText
        {
            get => (string)GetValue(ResponseTextProperty);
            set => SetValue(ResponseTextProperty, value);
        }

        private void Ok_Click(object sender, RoutedEventArgs e)
        {
            DialogResult = true;
        }

        private void InputTextBox_GotKeyboardFocus(object sender, System.Windows.Input.KeyboardFocusChangedEventArgs e)
        {
            InputTextBox.SelectAll();
        }
    }
}
