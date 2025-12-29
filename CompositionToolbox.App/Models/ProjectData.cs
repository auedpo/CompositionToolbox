using System;
using System.Collections.Generic;

namespace CompositionToolbox.App.Models
{
    public class ProjectData
    {
        public List<AtomicNode> Nodes { get; set; } = new List<AtomicNode>();
        public List<Composite> Composites { get; set; } = new List<Composite>();
        public List<CompositeState> States { get; set; } = new List<CompositeState>();
        public List<CompositeTransformLogEntry> LogEntries { get; set; } = new List<CompositeTransformLogEntry>();
        public Guid? ActiveCompositeId { get; set; }
        public Guid? ActiveStateId { get; set; }
    }
}
