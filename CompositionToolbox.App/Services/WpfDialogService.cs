// Purpose: Default dialog implementation that shows the WPF dialogs.

using System;
using System.Windows;
using CompositionToolbox.App.Views.Dialogs;

namespace CompositionToolbox.App.Services
{
    public sealed class WpfDialogService : IDialogService
    {
        public string? PromptText(string title, string message, string defaultValue)
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

        public bool Confirm(string title, string message)
        {
            var dialog = new ConfirmDialog
            {
                Title = title,
                Message = message
            };
            AttachOwner(dialog);
            return dialog.ShowDialog() == true;
        }

        public void Info(string title, string message)
        {
            var dialog = new MessageDialog
            {
                Title = title,
                Message = message
            };
            AttachOwner(dialog);
            dialog.ShowDialog();
        }

        public void Warning(string title, string message)
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
