// Purpose: Interface for supplying preview data to lens views.

using System.ComponentModel;
using CompositionToolbox.App.Models;

namespace CompositionToolbox.App.ViewModels
{
    public interface ILensPreviewSource : INotifyPropertyChanged
    {
        WorkspacePreview? WorkspacePreview { get; }
    }
}
