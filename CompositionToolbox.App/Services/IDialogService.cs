namespace CompositionToolbox.App.Services
{
    public interface IDialogService
    {
        string? PromptText(string title, string message, string defaultValue);
        bool Confirm(string title, string message);
        void Info(string title, string message);
        void Warning(string title, string message);
    }
}
