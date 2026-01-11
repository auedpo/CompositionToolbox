// Purpose: Static façade that routes dialog calls through an IDialogService.

using System;

namespace CompositionToolbox.App.Services
{
    public static class DialogService
    {
        private static IDialogService? _implementation;

        public static IDialogService Implementation
        {
            get => _implementation ??= new WpfDialogService();
            set => _implementation = value ?? throw new ArgumentNullException(nameof(value));
        }

        public static string? PromptText(string title, string message, string defaultValue)
            => Implementation.PromptText(title, message, defaultValue);

        public static bool Confirm(string title, string message)
            => Implementation.Confirm(title, message);

        public static void Info(string title, string message)
            => Implementation.Info(title, message);

        public static void Warning(string title, string message)
            => Implementation.Warning(title, message);
    }
}
