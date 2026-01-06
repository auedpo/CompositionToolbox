using System;
using Xunit;
using CompositionToolbox.App.Stores;
using CompositionToolbox.App.Models;
using System.Collections.Generic;

namespace CompositionToolbox.Tests
{
    public class TransformDuplicationTests
    {
        [Fact]
        public void NewCompositeThenAddFirstNode_DoesNotDuplicateLogEntries()
        {
            var store = new CompositeStore();
            var comp = new Composite { CompositeId = Guid.NewGuid(), Title = "test" };
            store.Composites.Add(comp);
            store.SetSelectedComposite(comp);

            var candidate = new AtomicNode
            {
                NodeId = Guid.NewGuid(),
                Mode = PcMode.Ordered,
                Modulus = 12,
                Ordered = new int[] { 0, 1, 2 },
                Unordered = new int[] { 0, 1, 2 },
                OpFromPrev = new OpDescriptor { OpType = "INPUT", SourceLens = "Test", SourceNodeId = null }
            };

            // Register the node and perform transform once
            var nodeId = store.GetOrAddNode(candidate);
            var newState = new CompositeState { StateId = Guid.NewGuid() };
            store.TransformState("INPUT", new Dictionary<string, object> { ["_test"] = true }, newState);

            // Attempt to apply the same transform again (simulating duplicate call path)
            // Use a new state object but with the same StateId to simulate identical transform
            var duplicateState = new CompositeState { StateId = newState.StateId };

            // The second call should be suppressed; ensure only one log entry exists after duplicate transform attempt.
            store.TransformState("INPUT", new Dictionary<string, object> { ["_test"] = true }, duplicateState);

            var entries = store.LogEntries;
            Assert.Single(entries);
        }
    }
}
