using System;
using System.Collections.Generic;
using System.Collections.ObjectModel;
using System.Linq;
using CommunityToolkit.Mvvm.ComponentModel;
using CompositionToolbox.App.Models;

namespace CompositionToolbox.App.Stores
{
    public class CompositeStore : ObservableObject
    {
        private static int _transformInvocationCounter;
        public ObservableCollection<AtomicNode> Nodes { get; } = new ObservableCollection<AtomicNode>();
        public ObservableCollection<Composite> Composites { get; } = new ObservableCollection<Composite>();
        public ObservableCollection<CompositeState> States { get; } = new ObservableCollection<CompositeState>();
        public ObservableCollection<CompositeTransformLogEntry> LogEntries { get; } = new ObservableCollection<CompositeTransformLogEntry>();
        public ObservableCollection<CompositeTransformLogEntry> CurrentLogEntries { get; } = new ObservableCollection<CompositeTransformLogEntry>();

        private Composite? _selectedComposite;
        private CompositeState? _selectedState;
        private CompositeTransformLogEntry? _lastTransformEntry;

        public Composite? SelectedComposite
        {
            get => _selectedComposite;
            set
            {
                if (SetProperty(ref _selectedComposite, value))
                {
                    SelectedState = GetCurrentState(value);
                    UpdateCurrentLog();
                }
            }
        }

        public CompositeState? SelectedState
        {
            get => _selectedState;
            set => SetProperty(ref _selectedState, value);
        }

        public CompositeTransformLogEntry? LastTransformEntry
        {
            get => _lastTransformEntry;
            private set => SetProperty(ref _lastTransformEntry, value);
        }

        public void Load(ProjectData data)
        {
            Nodes.Clear();
            Composites.Clear();
            States.Clear();
            LogEntries.Clear();
            CurrentLogEntries.Clear();

            foreach (var node in data.Nodes) Nodes.Add(node);
            foreach (var comp in data.Composites) Composites.Add(comp);
            foreach (var state in data.States) States.Add(state);
            foreach (var entry in data.LogEntries) LogEntries.Add(entry);

            SelectedComposite = data.ActiveCompositeId.HasValue
                ? Composites.FirstOrDefault(c => c.CompositeId == data.ActiveCompositeId.Value)
                : Composites.FirstOrDefault();

            SelectedState = data.ActiveStateId.HasValue
                ? States.FirstOrDefault(s => s.StateId == data.ActiveStateId.Value)
                : GetCurrentState(SelectedComposite);

            UpdateCurrentLog();
        }

        public ProjectData ToProjectData()
        {
            return new ProjectData
            {
                Nodes = Nodes.ToList(),
                Composites = Composites.ToList(),
                States = States.ToList(),
                LogEntries = LogEntries.ToList(),
                ActiveCompositeId = SelectedComposite?.CompositeId,
                ActiveStateId = SelectedState?.StateId
            };
        }

        public CompositeState? GetCurrentState(Composite? composite)
        {
            if (composite == null) return null;
            if (composite.CurrentStateId.HasValue)
            {
                return States.FirstOrDefault(s => s.StateId == composite.CurrentStateId.Value);
            }
            return States.FirstOrDefault(s => s.CompositeId == composite.CompositeId);
        }

        public void SetSelectedComposite(Composite composite)
        {
            SelectedComposite = composite;
            SelectedState = GetCurrentState(composite);
            UpdateCurrentLog();
        }

        public Composite TransformState(string op, Dictionary<string, object>? opParams, CompositeState newState)
        {
            if (SelectedComposite == null)
            {
                throw new InvalidOperationException("No selected composite.");
            }

            var prevState = SelectedState;
            newState.CompositeId = SelectedComposite.CompositeId;
            States.Add(newState);
            var traceParams = opParams == null
                ? new Dictionary<string, object>()
                : new Dictionary<string, object>(opParams);
            if (!traceParams.ContainsKey("__trace"))
            {
                traceParams["__trace"] = Environment.StackTrace;
            }
            if (!traceParams.ContainsKey("__seq"))
            {
                traceParams["__seq"] = System.Threading.Interlocked.Increment(ref _transformInvocationCounter);
            }
            if (!traceParams.ContainsKey("__thread"))
            {
                traceParams["__thread"] = Environment.CurrentManagedThreadId;
            }
            if (!traceParams.ContainsKey("__time"))
            {
                traceParams["__time"] = DateTime.UtcNow.ToString("O");
            }

            var entry = new CompositeTransformLogEntry
            {
                CompositeId = SelectedComposite.CompositeId,
                PrevStateId = prevState?.StateId,
                NewStateId = newState.StateId,
                Op = op,
                OpParams = traceParams,
                Patch = BuildPatch(prevState, newState)
            };
            LogEntries.Add(entry);

            SelectedComposite.CurrentStateId = newState.StateId;
            UpdateCurrentLog();
            SelectedState = newState;
            LastTransformEntry = entry;
            return SelectedComposite;
        }

        public CompositeRefPatch BuildPatch(CompositeState? prev, CompositeState next)
        {
            var patch = new CompositeRefPatch();
            AddChange(patch, "PitchRef", prev?.PitchRef, next.PitchRef);
            AddChange(patch, "RhythmRef", prev?.RhythmRef, next.RhythmRef);
            AddChange(patch, "RegisterRef", prev?.RegisterRef, next.RegisterRef);
            AddChange(patch, "InstrumentRef", prev?.InstrumentRef, next.InstrumentRef);
            AddChange(patch, "VoicingRef", prev?.VoicingRef, next.VoicingRef);
            AddChange(patch, "EventsRef", prev?.EventsRef, next.EventsRef);
            return patch;
        }

        private static void AddChange(CompositeRefPatch patch, string slot, Guid? oldRef, Guid? newRef)
        {
            if (oldRef == newRef) return;
            patch.Changes.Add(new CompositeRefChange
            {
                Slot = slot,
                OldRef = oldRef,
                NewRef = newRef
            });
        }

        private void UpdateCurrentLog()
        {
            CurrentLogEntries.Clear();
            if (SelectedComposite == null) return;
            foreach (var entry in LogEntries)
            {
                if (entry.CompositeId != SelectedComposite.CompositeId) continue;
                CurrentLogEntries.Add(entry);
            }
        }
    }
}
