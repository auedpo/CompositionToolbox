// Purpose: Domain model that represents the Workspace Preview Attribute data used across the application.

namespace CompositionToolbox.App.Models
{
    public sealed class WorkspacePreviewAttribute
    {
        public WorkspacePreviewAttribute(string label, string value)
        {
            Label = label ?? string.Empty;
            Value = value ?? string.Empty;
        }

        public string Label { get; }
        public string Value { get; }
    }
}
