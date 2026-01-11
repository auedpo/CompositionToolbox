// Purpose: Core code file related to Composite Store Tests.

using CompositionToolbox.App.Models;
using CompositionToolbox.App.Services;
using CompositionToolbox.App.Stores;

namespace CompositionToolbox.Tests;

public class CompositeStoreTests
{
    [Fact]
    public void GetOrAddNode_ReusesEquivalentNode()
    {
        var store = new CompositeStore();
        var node1 = new AtomicNode
        {
            Modulus = 12,
            Mode = PcMode.Ordered,
            Ordered = new[] { 0, 4, 7 },
            Unordered = new[] { 0, 4, 7 }
        };

        var id1 = store.GetOrAddNode(node1);
        Assert.Single(store.Nodes);

        var node2 = new AtomicNode
        {
            Modulus = 12,
            Mode = PcMode.Ordered,
            Ordered = new[] { 0, 4, 7 },
            Unordered = new[] { 0, 4, 7 }
        };

        var id2 = store.GetOrAddNode(node2);
        Assert.Equal(id1, id2);
        Assert.Single(store.Nodes);
    }

    [Fact]
    public void GetOrAddNode_AddsWhenDifferent()
    {
        var store = new CompositeStore();
        var node1 = new AtomicNode
        {
            Modulus = 12,
            Mode = PcMode.Ordered,
            Ordered = new[] { 0, 4, 7 },
            Unordered = new[] { 0, 4, 7 }
        };

        var id1 = store.GetOrAddNode(node1);
        Assert.Single(store.Nodes);

        var node2 = new AtomicNode
        {
            Modulus = 12,
            Mode = PcMode.Ordered,
            Ordered = new[] { 0, 2, 4 },
            Unordered = new[] { 0, 2, 4 }
        };

        var id2 = store.GetOrAddNode(node2);
        Assert.NotEqual(id1, id2);
        Assert.Equal(2, store.Nodes.Count);
    }

    [Fact]
    public void CreateCompositeThenAddNode_DoesNotDuplicate()
    {
        var store = new CompositeStore();
        // simulate MainViewModel.CreateComposite
        var composite = new CompositionToolbox.App.Models.Composite { Title = "Test" };
        var state = new CompositionToolbox.App.Models.CompositeState { CompositeId = composite.CompositeId };
        composite.CurrentStateId = state.StateId;
        store.Composites.Add(composite);
        store.States.Add(state);
        store.SelectedComposite = composite;
        store.SelectedState = state;

        // simulate InitializationViewModel.CreatePitchListFromPreview behavior
        var node = new AtomicNode
        {
            Modulus = 12,
            Mode = PcMode.Ordered,
            Ordered = new[] { 0, 4, 7 },
            Unordered = new[] { 0, 4, 7 },
            Label = "Input",
            ValueType = AtomicValueType.PitchList,
            OpFromPrev = new OpDescriptor
            {
                OpType = "INPUT",
                OperationLabel = "Input",
                SourceLens = "Initialization",
                SourceNodeId = null
            }
        };

        var nodeId = store.GetOrAddNode(node);
        var prevState = store.SelectedState;
        var nextState = new CompositionToolbox.App.Models.CompositeState
        {
            CompositeId = store.SelectedComposite?.CompositeId ?? Guid.NewGuid(),
            PitchRef = nodeId,
            RhythmRef = prevState?.RhythmRef,
            RegisterRef = prevState?.RegisterRef,
            InstrumentRef = prevState?.InstrumentRef,
            VoicingRef = prevState?.VoicingRef,
            EventsRef = prevState?.EventsRef,
            ActivePreview = prevState?.ActivePreview ?? CompositionToolbox.App.Models.CompositePreviewTarget.Auto
        };

        store.TransformState("Input", null, nextState);

        Assert.Single(store.Nodes);
    }

    [Fact]
    public void CreateCompositeViaMainViewModel_ThenAddNode_DoesNotDuplicate()
    {
        var settingsService = new CompositionToolbox.App.Services.SettingsService();
        var appSettings = settingsService.Load();
        var store = new CompositeStore();
        var projectService = new CompositionToolbox.App.Services.ProjectService(Path.GetTempPath());
            var vm = new CompositionToolbox.App.ViewModels.MainViewModel(settingsService, appSettings, store, projectService, new TestDialogService());

        // create a new composite using the MainViewModel command (same as user flow)
        vm.NewCompositeCommand.Execute(null);
        vm.Initialization.Activate();

        // prepare input preview and invoke create
        vm.Initialization.InputText = "0 4 7";
        vm.Initialization.IsOrdered = true;
        vm.Initialization.CreatePitchListCommand.Execute(null);
        Assert.Single(store.Nodes);
    }

    [Fact]
    public void GetOrAddNode_IsThreadSafe()
    {
        var store = new CompositeStore();
        var node = new AtomicNode
        {
            Modulus = 12,
            Mode = PcMode.Ordered,
            Ordered = new[] { 0, 4, 7 },
            Unordered = new[] { 0, 4, 7 }
        };

        System.Threading.Tasks.Parallel.For(0, 20, _ =>
        {
            store.GetOrAddNode(new AtomicNode
            {
                Modulus = node.Modulus,
                Mode = node.Mode,
                Ordered = node.Ordered.ToArray(),
                Unordered = node.Unordered.ToArray()
            });
        });

        Assert.Single(store.Nodes);
    }
}

internal sealed class TestDialogService : IDialogService
{
    public bool Confirm(string title, string message) => true;

    public string? PromptText(string title, string message, string defaultValue) => "Test";

    public void Info(string title, string message) { }

    public void Warning(string title, string message) { }
}
