using System.Windows;
using CompositionToolbox.App.Views.Dialogs;

namespace CompositionToolbox.App.Services
{
    public static class DialogService
    {
        public static string? PromptText(string title, string message, string defaultValue)
        {
            var dialog = new TextPromptDialog
            {
                Title = title,
                Prompt = message,
                ResponseText = defaultValue
            };
            AttachOwner(dialog);
            return dialog.ShowDialog() == true ? dialog.ResponseText : null;
        }

        public static bool Confirm(string title, string message)
        {
            var dialog = new ConfirmDialog
            {
                Title = title,
                Message = message
            };
            AttachOwner(dialog);
            return dialog.ShowDialog() == true;
        }

        public static void Info(string title, string message)
        {
            var dialog = new MessageDialog
            {
                Title = title,
                Message = message
            };
            AttachOwner(dialog);
            dialog.ShowDialog();
        }

        public static void Warning(string title, string message)
        {
            var dialog = new MessageDialog
            {
                Title = title,
                Message = message
            };
            AttachOwner(dialog);
            dialog.ShowDialog();
        }

        private static void AttachOwner(Window dialog)
        {
            if (System.Windows.Application.Current?.MainWindow != null)
            {
                dialog.Owner = System.Windows.Application.Current.MainWindow;
            }
        }
    }
}
