// Purpose: Lens view model that drives the Interference Rhythm UI, preview, and commits.

using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.Json;
using System.Text.RegularExpressions;
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using CompositionToolbox.App.Models;
using CompositionToolbox.App.Services;
using CompositionToolbox.App.Stores;
using CompositionToolbox.App.Utilities;

namespace CompositionToolbox.App.ViewModels
{
    public sealed class InterferenceRhythmLensViewModel : ObservableObject, ILensPreviewSource, ILensActivation
    {
        private readonly CompositeStore _store;
        private string _generatorASplit = "3";
        private string _generatorBSplit = "2";
        private string _pitchAInput = string.Empty;
        private string _pitchBInput = string.Empty;
        private string _summaryText = string.Empty;
        private string _durationsDisplay = string.Empty;
        private WorkspacePreview? _workspacePreview;
        private IReadOnlyList<InterferenceEvent> _previewEvents = Array.Empty<InterferenceEvent>();
        private InterferenceResult? _lastResult;
        private bool _pendingPreview = true;
        private bool _isActive;
        private string _selectedBaseNoteValue = "1/8";
        private IReadOnlyList<GroupingOption> _groupingOptions = Array.Empty<GroupingOption>();
        private GroupingOption? _selectedGrouping;

        public InterferenceRhythmLensViewModel(CompositeStore store)
        {
            _store = store ?? throw new ArgumentNullException(nameof(store));
            PreviewCommand = new RelayCommand(UpdatePreview);
            CommitCommand = new RelayCommand(Commit, () => _lastResult != null);
        }

        public string GeneratorASplit
        {
            get => _generatorASplit;
            set
            {
                if (SetProperty(ref _generatorASplit, value ?? string.Empty))
                {
                    SchedulePreview();
                }
            }
        }

        public string GeneratorBSplit
        {
            get => _generatorBSplit;
            set
            {
                if (SetProperty(ref _generatorBSplit, value ?? string.Empty))
                {
                    SchedulePreview();
                }
            }
        }

        public string PitchAInput
        {
            get => _pitchAInput;
            set
            {
                if (SetProperty(ref _pitchAInput, value ?? string.Empty))
                {
                    SchedulePreview();
                }
            }
        }

        public string PitchBInput
        {
            get => _pitchBInput;
            set
            {
                if (SetProperty(ref _pitchBInput, value ?? string.Empty))
                {
                    SchedulePreview();
                }
            }
        }

        public string SummaryText
        {
            get => _summaryText;
            private set => SetProperty(ref _summaryText, value);
        }

        public string DurationsDisplay
        {
            get => _durationsDisplay;
            private set => SetProperty(ref _durationsDisplay, value);
        }

        public WorkspacePreview? WorkspacePreview => _workspacePreview;

        public IReadOnlyList<InterferenceEvent> PreviewEvents => _previewEvents;

        public IRelayCommand PreviewCommand { get; }

        public IRelayCommand CommitCommand { get; }

        public void Activate()
        {
            if (_isActive) return;
            _isActive = true;
            if (_pendingPreview)
            {
                UpdatePreview();
            }
        }

        public void Deactivate()
        {
            _isActive = false;
        }

        private void SchedulePreview()
        {
            _pendingPreview = true;
            if (_isActive)
            {
                UpdatePreview();
            }
        }

        public IReadOnlyList<string> BaseNoteValues => NotationDurationMapper.BaseNoteValues;

        public string BaseNoteValue
        {
            get => _selectedBaseNoteValue;
            set
            {
                if (SetProperty(ref _selectedBaseNoteValue, value ?? string.Empty))
                {
                    SchedulePreview();
                }
            }
        }

        private double SelectedBaseNoteBeats => NotationDurationMapper.GetBaseNoteBeats(BaseNoteValue);
        private int SelectedBaseNoteDenominator => NotationDurationMapper.GetBaseNoteDenominator(BaseNoteValue);

        public IReadOnlyList<GroupingOption> GroupingOptions => _groupingOptions;

        public GroupingOption? SelectedGrouping
        {
            get => _selectedGrouping;
            set
            {
                if (SetProperty(ref _selectedGrouping, value))
                {
                    SchedulePreview();
                }
            }
        }

        private void UpdatePreview()
        {
            if (!_isActive)
            {
                _pendingPreview = true;
                return;
            }

            _pendingPreview = false;
            var partsA = ParseParts(GeneratorASplit);
            var partsB = ParseParts(GeneratorBSplit);
            var result = ComputeResult(partsA, partsB);
            _lastResult = result;
            _previewEvents = result?.Events ?? Array.Empty<InterferenceEvent>();
            if (result != null)
            {
                UpdateGroupingOptions(result.Cycle);
            }
            SummaryText = result == null
                ? string.Empty
                : $"{FormatPartSet(partsA)} vs {FormatPartSet(partsB)} → LCM = {result.Cycle}, events {result.Events.Count}";
            DurationsDisplay = result == null ? string.Empty : $"Durations: {string.Join(' ', result.Durations)}";
            _workspacePreview = result == null ? null : BuildWorkspacePreview(result);
            OnPropertyChanged(nameof(WorkspacePreview));
            OnPropertyChanged(nameof(PreviewEvents));
            CommitCommand.NotifyCanExecuteChanged();
        }

        private InterferenceResult ComputeResult(int[] partsA, int[] partsB)
        {
            var pitchA = ParseNullableInt(PitchAInput);
            var pitchB = ParseNullableInt(PitchBInput);
            var generatorA = new RhythmGeneratorDef("A", partsA, pitchA);
            var generatorB = new RhythmGeneratorDef("B", partsB, pitchB);
            return InterferenceRhythmMath.ComputeResultant(new[] { generatorA, generatorB });
        }

        private WorkspacePreview BuildWorkspacePreview(InterferenceResult result)
        {
            var durations = result.Durations.ToArray();
            var node = new AtomicNode
            {
                NodeId = Guid.NewGuid(),
                Modulus = Math.Max(1, result.Cycle),
                Mode = PcMode.Ordered,
                Ordered = durations,
                Unordered = durations,
                ValueType = AtomicValueType.RhythmPattern,
                Label = "Interference Preview"
            };

            var attributes = new List<WorkspacePreviewAttribute>
            {
                new WorkspacePreviewAttribute("Lens", "Interference Rhythm"),
                new WorkspacePreviewAttribute("Cycle", result.Cycle.ToString()),
                new WorkspacePreviewAttribute("Events", result.Events.Count.ToString()),
                new WorkspacePreviewAttribute("Durations", string.Join(' ', result.Durations)),
                new WorkspacePreviewAttribute("Generators", string.Join(' ', result.GeneratorPeriods))
            };
            if (_selectedGrouping != null)
            {
                attributes.Add(new WorkspacePreviewAttribute("Grouping", _selectedGrouping.Label));
            }

            var notationExtras = BuildNotationExtras(result);
            return new WorkspacePreview(node, "line", attributes, notationExtras: notationExtras);
        }

        private NotationRenderExtras BuildNotationExtras(InterferenceResult result)
        {
            var usePercussion = result.Events.Any(e => e.Unpitched);
            var clef = usePercussion ? "percussion" : "treble";
            var events = result.Events.Select((evt, idx) =>
            {
                var units = result.Durations[idx];
                var durationSymbol = NotationDurationMapper.MapDurationSymbol(units, SelectedBaseNoteBeats);
                var segments = NotationDurationMapper.BuildDurationSegments(units, BaseNoteValue);
                return new NotationEventSpec(evt.Pitches, durationSymbol, units, segments);
            }).ToArray();
            var measureUnits = _selectedGrouping?.MeasureUnits;
            return new NotationRenderExtras(clef, events, SelectedBaseNoteBeats, BaseNoteValue, measureUnits, result.Cycle);
        }

        private void Commit()
        {
            if (_lastResult == null) return;
            var partsA = ParseParts(GeneratorASplit);
            var partsB = ParseParts(GeneratorBSplit);
            var pitchA = ParseNullableInt(PitchAInput);
            var pitchB = ParseNullableInt(PitchBInput);
            var groupingUnits = _selectedGrouping?.MeasureUnits ?? _lastResult.Cycle;
            var args = new Dictionary<string, object>
            {
                ["PartsA"] = partsA,
                ["PartsB"] = partsB,
                ["PitchA"] = pitchA!,
                ["PitchB"] = pitchB!,
                ["GroupingUnits"] = groupingUnits
            };

            var valuePayload = new
            {
                kind = "RhythmDurationsV1",
                generatorPeriods = _lastResult.GeneratorPeriods,
                cycle = _lastResult.Cycle,
                durations = _lastResult.Durations,
                baseNoteValue = BaseNoteValue,
                grouping = new
                {
                    measureUnits = groupingUnits
                }
            };

            var node = new AtomicNode
            {
                NodeId = Guid.NewGuid(),
                Modulus = Math.Max(1, _lastResult.Cycle),
                Mode = PcMode.Ordered,
                Ordered = _lastResult.Durations.ToArray(),
                Unordered = _lastResult.Durations.ToArray(),
                ValueType = AtomicValueType.RhythmPattern,
                Label = "Interference Rhythm",
                ValueJson = JsonSerializer.Serialize(valuePayload),
                OpFromPrev = new OpDescriptor
                {
                    OpType = "InterferenceRhythm",
                    OpKey = OpKeys.RhythmInterferenceApply,
                    OperationLabel = "Interference Rhythm",
                    Title = "Interference Rhythm",
                    SourceLens = "InterferenceRhythm",
                    SourceNodeId = _store.SelectedState?.RhythmRef,
                    OpParams = OperationLog.CreateParams(args)
                }
            };

            var nodeId = _store.GetOrAddNode(node);
            var prevState = _store.SelectedState;
            var nextState = new CompositeState
            {
                CompositeId = _store.SelectedComposite?.CompositeId ?? Guid.NewGuid(),
                RhythmRef = nodeId,
                PitchRef = prevState?.PitchRef,
                RegisterRef = prevState?.RegisterRef,
                InstrumentRef = prevState?.InstrumentRef,
                VoicingRef = prevState?.VoicingRef,
                EventsRef = prevState?.EventsRef,
                ActivePreview = prevState?.ActivePreview ?? CompositePreviewTarget.Auto
            };

            var opParams = OperationLog.CreateParams(args);
            _store.TransformState("InterferenceRhythm", opParams, nextState, OpKeys.RhythmInterferenceApply, node.OpFromPrev.OpType, slotOrder: new[] { "RhythmRef" });
        }

        private void UpdateGroupingOptions(int cycle)
        {
            var divisors = RhythmGrouping.GetMeasureDivisors(cycle);
            var options = new List<GroupingOption>(divisors.Length);
            foreach (var divisor in divisors)
            {
                var label = $"{divisor} units ({divisor}/{SelectedBaseNoteDenominator})";
                options.Add(new GroupingOption(divisor, label));
            }

            var desiredUnits = _selectedGrouping?.MeasureUnits;
            _groupingOptions = options;
            OnPropertyChanged(nameof(GroupingOptions));

            var nextSelection = desiredUnits.HasValue
                ? _groupingOptions.FirstOrDefault(o => o.MeasureUnits == desiredUnits.Value)
                : null;
            _selectedGrouping = nextSelection ?? _groupingOptions.LastOrDefault();
            OnPropertyChanged(nameof(SelectedGrouping));
        }

        private static int? ParseNullableInt(string? text)
        {
            if (string.IsNullOrWhiteSpace(text))
            {
                return null;
            }

            return int.TryParse(text, out var value) ? value : null;
        }

        private static int[] ParseParts(string? text)
        {
            if (string.IsNullOrWhiteSpace(text))
            {
                return Array.Empty<int>();
            }

            var tokens = Regex.Split(text, @"[^\d]+");
            var parts = tokens
                .Where(token => !string.IsNullOrWhiteSpace(token))
                .Select(token => int.TryParse(token, out var value) ? Math.Max(1, value) : 0)
                .Where(value => value > 0)
                .ToArray();

            return parts.Length == 0 ? new[] { 1 } : parts;
        }

        private static string FormatPartSet(int[] parts)
        {
            return $"[{string.Join(' ', parts)}]";
        }

        public sealed class GroupingOption
        {
            public GroupingOption(int measureUnits, string label)
            {
                MeasureUnits = measureUnits;
                Label = label ?? measureUnits.ToString();
            }

            public int MeasureUnits { get; }

            public string Label { get; }
        }
    }
}
