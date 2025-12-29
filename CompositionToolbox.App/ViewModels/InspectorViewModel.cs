using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using CompositionToolbox.App.Models;
using CompositionToolbox.App.Services;
using CompositionToolbox.App.Stores;
using System;
using System.Collections.Generic;
using System.Collections.Specialized;
using System.Collections.ObjectModel;
using System.Linq;
using System.Threading.Tasks;

namespace CompositionToolbox.App.ViewModels
{
    public enum InspectorNotationMode
    {
        Chord,
        Sequence
    }

    public class InspectorViewModel : ObservableObject
    {
        private readonly TransformLogStore _store;
        private readonly MidiService _midiService;
        private readonly Func<RealizationConfig> _getRealizationConfig;
        private readonly Dictionary<Guid, RealizationConfig> _sessionOverrides = new();
        private PitchNode? _selectedNode;
        private int[] _setProjection = Array.Empty<int>();
        private InspectorNotationMode _selectedNotationMode = InspectorNotationMode.Chord;
        private AccidentalRule _accidentalRule;
        private bool _isOrdered;
        private string _badge = "[ ]";
        private string _primaryDisplay = string.Empty;
        private bool _isEditingLabel;
        private string _labelLine = "Label: -";
        private string _labelEdit = string.Empty;
        private string _fromLine = "From: -";
        private string _sequenceDisplay = string.Empty;
        private string _lengthDisplay = string.Empty;
        private string _uniqueCountDisplay = string.Empty;
        private string _setProjectionDisplay = "[]";
        private string _normalFormDisplay = "()";
        private string _primeFormDisplay = "()";
        private string _oisDisplay = string.Empty;
        private string _intervalVectorDisplay = string.Empty;
        private string _linearSpanDisplay = string.Empty;
        private string _cardinalityDisplay = string.Empty;
        private string _commitUnorderedLabel = "Commit as Unordered node";
        private bool _canCommitUnordered;
        private bool _canCommitSetOrdering;
        private bool _canCommitNormalForm;
        private bool _canCommitPrimeForm;
        private PitchNode? _notationNode;
        private int[] _notationMidiNotes = Array.Empty<int>();
        private string _notationRenderMode = "chord";
        private bool _useSessionOverride;
        private int _overridePc0NoteIndex;
        private int _overridePc0Octave;
        private bool _overrideUseAmbitus;
        private int _overrideAmbitusLowNoteIndex;
        private int _overrideAmbitusLowOctave;
        private int _overrideAmbitusHighNoteIndex;
        private int _overrideAmbitusHighOctave;
        private OrderedUnwrapMode _overrideOrderedUnwrapMode;
        private ChordVoicingMode _overrideChordVoicingMode;
        private bool _loadingOverride;

        public InspectorViewModel(TransformLogStore store, MidiService midiService, Func<RealizationConfig> getRealizationConfig)
        {
            _store = store;
            _midiService = midiService;
            _getRealizationConfig = getRealizationConfig;

            PlayDisplayedCommand = new RelayCommand(async () => await PlayDisplayedAsync(), () => SelectedNode != null);
            CommitUnorderedCommand = new RelayCommand(CommitUnordered, () => CanCommitUnordered);
            CommitNormalFormCommand = new RelayCommand(CommitNormalForm, () => CanCommitNormalForm);
            CommitPrimeFormCommand = new RelayCommand(CommitPrimeForm, () => CanCommitPrimeForm);
            EditLabelCommand = new RelayCommand(BeginEditLabel);

            _store.SelectedNodeChanged += (_, node) => UpdateFromNode(node);
            _store.Nodes.CollectionChanged += Nodes_CollectionChanged;
            UpdateFromNode(_store.SelectedNode);
        }

        private void Nodes_CollectionChanged(object? sender, NotifyCollectionChangedEventArgs e)
        {
            UpdateFromNode(SelectedNode);
        }

        public IRelayCommand PlayDisplayedCommand { get; }
        public IRelayCommand CommitUnorderedCommand { get; }
        public IRelayCommand CommitNormalFormCommand { get; }
        public IRelayCommand CommitPrimeFormCommand { get; }
        public IRelayCommand EditLabelCommand { get; }

        public ObservableCollection<string> NoteNames { get; } = new ObservableCollection<string>
        {
            "C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"
        };

        public ObservableCollection<int> Octaves { get; } = new ObservableCollection<int>(Enumerable.Range(-1, 10));

        public ObservableCollection<OrderedUnwrapMode> OrderedUnwrapModes { get; } =
            new ObservableCollection<OrderedUnwrapMode>(Enum.GetValues<OrderedUnwrapMode>());

        public ObservableCollection<ChordVoicingMode> ChordVoicingModes { get; } =
            new ObservableCollection<ChordVoicingMode>(Enum.GetValues<ChordVoicingMode>());

        public PitchNode? SelectedNode
        {
            get => _selectedNode;
            private set => SetProperty(ref _selectedNode, value);
        }

        public AccidentalRule AccidentalRule
        {
            get => _accidentalRule;
            set => SetProperty(ref _accidentalRule, value);
        }

        public InspectorNotationMode SelectedNotationMode
        {
            get => _selectedNotationMode;
            set
            {
                if (SetProperty(ref _selectedNotationMode, value))
                {
                    UpdateNotationNode();
                }
            }
        }

        public bool IsOrdered
        {
            get => _isOrdered;
            private set => SetProperty(ref _isOrdered, value);
        }

        public string Badge
        {
            get => _badge;
            private set => SetProperty(ref _badge, value);
        }

        public string PrimaryDisplay
        {
            get => _primaryDisplay;
            private set => SetProperty(ref _primaryDisplay, value);
        }

        public bool IsEditingLabel
        {
            get => _isEditingLabel;
            set => SetProperty(ref _isEditingLabel, value);
        }

        public string PrimaryDisplayLabel
        {
            get
            {
                if (string.IsNullOrWhiteSpace(_selectedNode?.Label)) return string.Empty;
                if (string.Equals(_selectedNode.Label, "Input", StringComparison.OrdinalIgnoreCase)) return string.Empty;
                return _selectedNode.Label;
            }
        }

        public string LabelLine
        {
            get => _labelLine;
            private set => SetProperty(ref _labelLine, value);
        }

        public string LabelEdit
        {
            get => _labelEdit;
            set => SetProperty(ref _labelEdit, value);
        }

        public string FromLine
        {
            get => _fromLine;
            private set => SetProperty(ref _fromLine, value);
        }

        public string SequenceDisplay
        {
            get => _sequenceDisplay;
            private set => SetProperty(ref _sequenceDisplay, value);
        }

        public string LengthDisplay
        {
            get => _lengthDisplay;
            private set => SetProperty(ref _lengthDisplay, value);
        }

        public string UniqueCountDisplay
        {
            get => _uniqueCountDisplay;
            private set => SetProperty(ref _uniqueCountDisplay, value);
        }

        public string SetProjectionDisplay
        {
            get => _setProjectionDisplay;
            private set => SetProperty(ref _setProjectionDisplay, value);
        }

        public string NormalFormDisplay
        {
            get => _normalFormDisplay;
            private set => SetProperty(ref _normalFormDisplay, value);
        }

        public string PrimeFormDisplay
        {
            get => _primeFormDisplay;
            private set => SetProperty(ref _primeFormDisplay, value);
        }

        public string OisDisplay
        {
            get => _oisDisplay;
            private set => SetProperty(ref _oisDisplay, value);
        }

        public string IntervalVectorDisplay
        {
            get => _intervalVectorDisplay;
            private set => SetProperty(ref _intervalVectorDisplay, value);
        }

        public string LinearSpanDisplay
        {
            get => _linearSpanDisplay;
            private set => SetProperty(ref _linearSpanDisplay, value);
        }

        public string CardinalityDisplay
        {
            get => _cardinalityDisplay;
            private set => SetProperty(ref _cardinalityDisplay, value);
        }

        public string CommitUnorderedLabel
        {
            get => _commitUnorderedLabel;
            private set => SetProperty(ref _commitUnorderedLabel, value);
        }

        public bool CanCommitUnordered
        {
            get => _canCommitUnordered;
            private set => SetProperty(ref _canCommitUnordered, value);
        }

        public bool CanCommitSetOrdering
        {
            get => _canCommitSetOrdering;
            private set => SetProperty(ref _canCommitSetOrdering, value);
        }

        public bool CanCommitNormalForm
        {
            get => _canCommitNormalForm;
            private set => SetProperty(ref _canCommitNormalForm, value);
        }

        public bool CanCommitPrimeForm
        {
            get => _canCommitPrimeForm;
            private set => SetProperty(ref _canCommitPrimeForm, value);
        }

        public PitchNode? NotationNode
        {
            get => _notationNode;
            private set => SetProperty(ref _notationNode, value);
        }

        public int[] NotationMidiNotes
        {
            get => _notationMidiNotes;
            private set => SetProperty(ref _notationMidiNotes, value);
        }

        public string NotationRenderMode
        {
            get => _notationRenderMode;
            private set => SetProperty(ref _notationRenderMode, value);
        }

        public bool UseSessionOverride
        {
            get => _useSessionOverride;
            set
            {
                if (SetProperty(ref _useSessionOverride, value))
                {
                    UpdateSessionOverride();
                }
            }
        }

        public int OverridePc0NoteIndex
        {
            get => _overridePc0NoteIndex;
            set
            {
                if (SetProperty(ref _overridePc0NoteIndex, value))
                {
                    SaveOverrideFields();
                }
            }
        }

        public int OverridePc0Octave
        {
            get => _overridePc0Octave;
            set
            {
                if (SetProperty(ref _overridePc0Octave, value))
                {
                    SaveOverrideFields();
                }
            }
        }

        public bool OverrideUseAmbitus
        {
            get => _overrideUseAmbitus;
            set
            {
                if (SetProperty(ref _overrideUseAmbitus, value))
                {
                    SaveOverrideFields();
                }
            }
        }

        public int OverrideAmbitusLowNoteIndex
        {
            get => _overrideAmbitusLowNoteIndex;
            set
            {
                if (SetProperty(ref _overrideAmbitusLowNoteIndex, value))
                {
                    SaveOverrideFields();
                }
            }
        }

        public int OverrideAmbitusLowOctave
        {
            get => _overrideAmbitusLowOctave;
            set
            {
                if (SetProperty(ref _overrideAmbitusLowOctave, value))
                {
                    SaveOverrideFields();
                }
            }
        }

        public int OverrideAmbitusHighNoteIndex
        {
            get => _overrideAmbitusHighNoteIndex;
            set
            {
                if (SetProperty(ref _overrideAmbitusHighNoteIndex, value))
                {
                    SaveOverrideFields();
                }
            }
        }

        public int OverrideAmbitusHighOctave
        {
            get => _overrideAmbitusHighOctave;
            set
            {
                if (SetProperty(ref _overrideAmbitusHighOctave, value))
                {
                    SaveOverrideFields();
                }
            }
        }

        public OrderedUnwrapMode OverrideOrderedUnwrapMode
        {
            get => _overrideOrderedUnwrapMode;
            set
            {
                if (SetProperty(ref _overrideOrderedUnwrapMode, value))
                {
                    SaveOverrideFields();
                }
            }
        }

        public ChordVoicingMode OverrideChordVoicingMode
        {
            get => _overrideChordVoicingMode;
            set
            {
                if (SetProperty(ref _overrideChordVoicingMode, value))
                {
                    SaveOverrideFields();
                }
            }
        }

        public void CommitLabelEdit()
        {
            if (SelectedNode == null) return;
            var trimmed = string.IsNullOrWhiteSpace(LabelEdit) ? string.Empty : LabelEdit.Trim();
            if (SelectedNode.Label == trimmed) return;
            SelectedNode.Label = trimmed;
            LabelLine = string.IsNullOrWhiteSpace(trimmed) ? "Label: -" : $"Label: {trimmed}";
            PrimaryDisplay = IsOrdered ? FormatOrdered(SelectedNode.Ordered) : FormatUnordered(SelectedNode.Unordered);
            SetProjectionDisplay = FormatUnordered(_setProjection);
            OnPropertyChanged(nameof(PrimaryDisplayLabel));
            OnPropertyChanged(nameof(SelectedNode));
        }

        private void BeginEditLabel()
        {
            if (SelectedNode == null) return;
            IsEditingLabel = true;
        }

        private void UpdateFromNode(PitchNode? node)
        {
            SelectedNode = node;
            if (node == null)
            {
                Badge = "[ ]";
                PrimaryDisplay = string.Empty;
                OnPropertyChanged(nameof(PrimaryDisplayLabel));
                LabelLine = "Label: -";
                FromLine = "From: -";
                LabelEdit = string.Empty;
                SequenceDisplay = string.Empty;
                LengthDisplay = string.Empty;
                UniqueCountDisplay = string.Empty;
                SetProjectionDisplay = "[]";
                NormalFormDisplay = "()";
                PrimeFormDisplay = "()";
                OisDisplay = string.Empty;
                IntervalVectorDisplay = string.Empty;
                LinearSpanDisplay = string.Empty;
                CardinalityDisplay = string.Empty;
                CommitUnorderedLabel = "Commit as Unordered node";
                CanCommitUnordered = false;
                CanCommitSetOrdering = false;
                CanCommitNormalForm = false;
                CanCommitPrimeForm = false;
                IsOrdered = false;
                _loadingOverride = true;
                UseSessionOverride = false;
                _loadingOverride = false;
                _setProjection = Array.Empty<int>();
                UpdateNotationNode();
                UpdateCommandStates();
                return;
            }

            IsOrdered = node.Mode == PcMode.Ordered;
            Badge = IsOrdered ? "[O]" : "[U]";
            PrimaryDisplay = IsOrdered ? FormatOrdered(node.Ordered) : FormatUnordered(node.Unordered);
            OnPropertyChanged(nameof(PrimaryDisplayLabel));
            OnPropertyChanged(nameof(PrimaryDisplayLabel));
            SequenceDisplay = IsOrdered ? $"Sequence: {FormatOrdered(node.Ordered)}" : string.Empty;
            LengthDisplay = IsOrdered ? $"Length: k = {node.Ordered.Length}" : string.Empty;
            UniqueCountDisplay = IsOrdered ? $"Unique pcs: u = {node.Ordered.Distinct().Count()}" : string.Empty;

            LabelLine = string.IsNullOrWhiteSpace(node.Label) ? "Label: -" : $"Label: {node.Label}";
            FromLine = node.OpFromPrev == null ? "From: -" : $"From: {node.OpFromPrev.ToDisplayString()}";
            LabelEdit = node.Label;

            _setProjection = IsOrdered
                ? MusicUtils.NormalizeUnordered(node.Ordered, node.Modulus)
                : MusicUtils.NormalizeUnordered(node.Unordered, node.Modulus);

            SetProjectionDisplay = FormatUnordered(_setProjection);
            var normalForm = MusicUtils.ComputeNormalOrder(_setProjection, node.Modulus);
            var primeForm = MusicUtils.ComputePrimeForm(_setProjection, node.Modulus);
            NormalFormDisplay = FormatOrdered(normalForm);
            PrimeFormDisplay = FormatOrdered(primeForm);
            CardinalityDisplay = $"|S| = {_setProjection.Length}";
            LinearSpanDisplay = _setProjection.Length == 0
                ? "Linear span: 0"
                : $"Linear span: {_setProjection[^1] - _setProjection[0]}";
            OisDisplay = $"OIS (circular): {FormatCircularOis(_setProjection, node.Modulus)}";
            IntervalVectorDisplay = _setProjection.Length == 0
                ? "IV: -"
                : $"IV: [{string.Join(' ', MusicUtils.ComputeIntervalVector(_setProjection, node.Modulus))}]";

            CommitUnorderedLabel = IsOrdered ? "Commit as Unordered node" : "Already Unordered";
            var hasUnorderedCandidate = NodeExists(node.Modulus, PcMode.Unordered, _setProjection, null);
            CanCommitUnordered = IsOrdered && !hasUnorderedCandidate;
            CanCommitSetOrdering = _setProjection.Length > 0;
            if (_setProjection.Length > 0)
            {
                var hasNormalCandidate = NodeExists(node.Modulus, PcMode.Ordered, normalForm, _setProjection);
                var hasPrimeCandidate = NodeExists(node.Modulus, PcMode.Ordered, primeForm, _setProjection);
                CanCommitNormalForm = CanCommitSetOrdering && !hasNormalCandidate;
                CanCommitPrimeForm = CanCommitSetOrdering && !hasPrimeCandidate;
            }
            else
            {
                CanCommitNormalForm = false;
                CanCommitPrimeForm = false;
            }

            LoadSessionOverride();
            UpdateNotationNode();
            UpdateCommandStates();
        }

        private void UpdateNotationNode()
        {
            var node = SelectedNode;
            if (node == null)
            {
                NotationNode = null;
                NotationMidiNotes = Array.Empty<int>();
                return;
            }

            var isChord = SelectedNotationMode == InspectorNotationMode.Chord;
            NotationRenderMode = isChord ? "chord" : "line";

            int[] displayPcs = GetDisplayPcs(isChord);
            var mode = isChord ? PcMode.Unordered : node.Mode;

            NotationNode = new PitchNode
            {
                Modulus = node.Modulus,
                Mode = mode,
                Ordered = displayPcs,
                Unordered = displayPcs,
                Label = node.Label,
                OpFromPrev = node.OpFromPrev
            };

            var config = GetEffectiveRealizationConfig();
            NotationMidiNotes = MusicUtils.RealizePcs(displayPcs, node.Modulus, mode, config);
        }

        private int[] GetDisplayPcs(bool isChord)
        {
            var node = SelectedNode;
            if (node == null) return Array.Empty<int>();

            if (node.Mode == PcMode.Ordered)
            {
                return isChord ? _setProjection : node.Ordered;
            }

            return _setProjection;
        }

        private async Task PlayDisplayedAsync()
        {
            var node = SelectedNode;
            if (node == null) return;

            var isChord = SelectedNotationMode == InspectorNotationMode.Chord;
            var pcs = GetDisplayPcs(isChord);
            if (pcs.Length == 0) return;

            var config = GetEffectiveRealizationConfig();
            var midi = MusicUtils.RealizePcs(pcs, node.Modulus, isChord ? PcMode.Unordered : PcMode.Ordered, config);
            if (isChord)
            {
                await _midiService.PlayMidiChord(midi);
            }
            else
            {
                await _midiService.PlayMidiSequence(midi);
            }
        }

        public void RefreshRealization()
        {
            UpdateNotationNode();
        }

        private void CommitUnordered()
        {
            if (SelectedNode == null || !IsOrdered) return;
            var node = SelectedNode;

            var unordered = _setProjection.ToArray();
            var candidate = new PitchNode
            {
                Modulus = node.Modulus,
                Mode = PcMode.Unordered,
                Ordered = unordered,
                Unordered = unordered,
                Label = node.Label,
                OpFromPrev = new OpDescriptor
                {
                    OpType = "FORGET_ORDER",
                    OperationLabel = "Forget order",
                    SourceLens = "Inspector",
                    SourceNodeId = node.Id,
                    OpParams = new Dictionary<string, object>
                    {
                        ["derivedFrom"] = "OrderedProjection"
                    }
                }
            };

            _store.AppendUnlessNoop(candidate);
        }

        private void CommitNormalForm()
        {
            if (SelectedNode == null || _setProjection.Length == 0) return;
            CommitSetOrdering("NF", "Choose ordering (NF)", MusicUtils.ComputeNormalOrder(_setProjection, SelectedNode.Modulus));
        }

        private void CommitPrimeForm()
        {
            if (SelectedNode == null || _setProjection.Length == 0) return;
            CommitSetOrdering("PF", "Choose ordering (PF)", MusicUtils.ComputePrimeForm(_setProjection, SelectedNode.Modulus));
        }

        private void CommitSetOrdering(string policy, string label, int[] ordered)
        {
            var node = SelectedNode;
            if (node == null) return;

            var candidate = new PitchNode
            {
                Modulus = node.Modulus,
                Mode = PcMode.Ordered,
                Ordered = ordered,
                Unordered = _setProjection.ToArray(),
                Label = node.Label,
                OpFromPrev = new OpDescriptor
                {
                    OpType = "CHOOSE_ORDERING",
                    OperationLabel = label,
                    SourceLens = "Inspector",
                    SourceNodeId = node.Id,
                    OpParams = new Dictionary<string, object>
                    {
                        ["policy"] = policy,
                        ["derivedFrom"] = "SetProjection"
                    }
                }
            };

            _store.AppendUnlessNoop(candidate);
        }

        private void UpdateCommandStates()
        {
            PlayDisplayedCommand.NotifyCanExecuteChanged();
            CommitUnorderedCommand.NotifyCanExecuteChanged();
            CommitNormalFormCommand.NotifyCanExecuteChanged();
            CommitPrimeFormCommand.NotifyCanExecuteChanged();
        }

        private bool NodeExists(int modulus, PcMode mode, int[] ordered, int[]? unordered)
        {
            return _store.Nodes.Any(n =>
                n.Modulus == modulus
                && n.Mode == mode
                && (mode == PcMode.Ordered
                    ? n.Ordered.SequenceEqual(ordered)
                    : n.Unordered.SequenceEqual(unordered ?? ordered)));
        }

        private void LoadSessionOverride()
        {
            if (SelectedNode == null)
            {
                UseSessionOverride = false;
                return;
            }

            _loadingOverride = true;
            try
            {
                if (_sessionOverrides.TryGetValue(SelectedNode.Id, out var config))
                {
                    ApplyOverrideToFields(config);
                    UseSessionOverride = true;
                }
                else
                {
                    var global = _getRealizationConfig();
                    ApplyOverrideToFields(global);
                    UseSessionOverride = false;
                }
            }
            finally
            {
                _loadingOverride = false;
            }
        }

        private void UpdateSessionOverride()
        {
            if (_loadingOverride) return;
            if (SelectedNode == null) return;

            if (!UseSessionOverride)
            {
                _sessionOverrides.Remove(SelectedNode.Id);
                UpdateNotationNode();
                return;
            }

            _sessionOverrides[SelectedNode.Id] = BuildOverrideFromFields();
            UpdateNotationNode();
        }

        private void SaveOverrideFields()
        {
            if (_loadingOverride) return;
            if (!UseSessionOverride) return;
            if (SelectedNode == null) return;

            _sessionOverrides[SelectedNode.Id] = BuildOverrideFromFields();
            UpdateNotationNode();
        }

        private void ApplyOverrideToFields(RealizationConfig config)
        {
            OverridePc0NoteIndex = ModToNoteIndex(config.Pc0RefMidi);
            OverridePc0Octave = MidiToOctave(config.Pc0RefMidi);
            OverrideUseAmbitus = config.AmbitusLowMidi.HasValue && config.AmbitusHighMidi.HasValue;
            OverrideAmbitusLowNoteIndex = ModToNoteIndex(config.AmbitusLowMidi ?? 48);
            OverrideAmbitusLowOctave = MidiToOctave(config.AmbitusLowMidi ?? 48);
            OverrideAmbitusHighNoteIndex = ModToNoteIndex(config.AmbitusHighMidi ?? 72);
            OverrideAmbitusHighOctave = MidiToOctave(config.AmbitusHighMidi ?? 72);
            OverrideOrderedUnwrapMode = config.OrderedUnwrapMode;
            OverrideChordVoicingMode = config.ChordVoicingMode;
        }

        private RealizationConfig BuildOverrideFromFields()
        {
            return new RealizationConfig
            {
                Pc0RefMidi = NoteOctaveToMidi(OverridePc0NoteIndex, OverridePc0Octave),
                AmbitusLowMidi = OverrideUseAmbitus
                    ? NoteOctaveToMidi(OverrideAmbitusLowNoteIndex, OverrideAmbitusLowOctave)
                    : null,
                AmbitusHighMidi = OverrideUseAmbitus
                    ? NoteOctaveToMidi(OverrideAmbitusHighNoteIndex, OverrideAmbitusHighOctave)
                    : null,
                OrderedUnwrapMode = OverrideOrderedUnwrapMode,
                ChordVoicingMode = OverrideChordVoicingMode,
                DefaultNotationMode = NotationPreference.Chord
            };
        }

        private RealizationConfig GetEffectiveRealizationConfig()
        {
            if (SelectedNode != null && _sessionOverrides.TryGetValue(SelectedNode.Id, out var overrideConfig))
            {
                return overrideConfig;
            }
            return _getRealizationConfig();
        }

        private static int MidiToOctave(int midi)
        {
            return (midi / 12) - 1;
        }

        private static int ModToNoteIndex(int midi)
        {
            var mod = midi % 12;
            return mod < 0 ? mod + 12 : mod;
        }

        private static int NoteOctaveToMidi(int noteIndex, int octave)
        {
            return (octave + 1) * 12 + noteIndex;
        }


        private static string FormatOrdered(int[] pcs)
        {
            return $"({string.Join(' ', pcs)})";
        }

        private static string FormatUnordered(int[] pcs)
        {
            return $"[{string.Join(' ', pcs)}]";
        }

        private static string FormatCircularOis(int[] set, int modulus)
        {
            if (set.Length == 0) return "⟨⟩";
            if (set.Length == 1) return "⟨0⟩";
            var ois = new int[set.Length];
            for (int i = 0; i < set.Length - 1; i++)
            {
                ois[i] = (set[i + 1] - set[i] + modulus) % modulus;
            }
            ois[^1] = (set[0] + modulus - set[^1]) % modulus;
            return $"⟨{string.Join(' ', ois)}⟩";
        }
    }
}
