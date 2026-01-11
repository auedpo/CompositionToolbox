// Purpose: Domain model that represents the Preset State data used across the application.

using System.Collections.Generic;

namespace CompositionToolbox.App.Models
{
    public class PresetState
    {
        public List<string> Favorites { get; set; } = new List<string>();
        public List<string> Recents { get; set; } = new List<string>();
    }
}
