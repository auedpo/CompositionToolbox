using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using System.Collections.ObjectModel;
using System;
using System.ComponentModel;
using CompositionToolbox.App.Stores;
using CompositionToolbox.App.Models;
using CompositionToolbox.App.Services;
using System.Threading.Tasks;
using System.Linq;
using System.Text.Json;
using System.Windows;
using System.Windows.Data;

namespace CompositionToolbox.App.ViewModels
{
    public class MainViewModel : ObservableObject
    {
        public CompositeStore Store { get; }
        public ObservableCollection<int> Moduli { get; } = new ObservableCollection<int> { 12, 19 };
        public ObservableCollection<string> NoteNames { get; } = new ObservableCollection<string>
        {
            "C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"
        };
        public ObservableCollection<int> Octaves { get; } = new ObservableCollection<int>(Enumerable.Range(-1, 10));
        public ObservableCollection<OrderedUnwrapMode> OrderedUnwrapModes { get; } =
            new ObservableCollection<OrderedUnwrapMode>(Enum.GetValues<OrderedUnwrapMode>());
        public ObservableCollection<ChordVoicingMode> ChordVoicingModes { get; } =
            new ObservableCollection<ChordVoicingMode>(Enum.GetValues<ChordVoicingMode>());
        public ObservableCollection<NotationPreference> NotationPreferences { get; } =
            new ObservableCollection<NotationPreference>(Enum.GetValues<NotationPreference>());

        private int _selectedModulus = 12;
        public int SelectedModulus
        {
            get => _selectedModulus;
            set
            {
                if (SetProperty(ref _selectedModulus, value))
                {
                    Initialization.RefreshForModulusChange();
                }
            }
        }

        public ObservableCollection<MidiDeviceInfo> MidiDevices { get; } = new ObservableCollection<MidiDeviceInfo>();

        private int _selectedMidiDeviceIndex = -1;
        public int SelectedMidiDeviceIndex
        {
            get => _selectedMidiDeviceIndex;
            set
            {
                if (SetProperty(ref _selectedMidiDeviceIndex, value))
                {
                    _midiService.OpenDevice(value);
                    _appSettings.SelectedMidiDeviceIndex = value;
                    _settingsService.Save(_appSettings);
                    TestMidiCommand?.NotifyCanExecuteChanged();
                    TestMicrotoneCommand?.NotifyCanExecuteChanged();
                }
            }
        }

        public InitializationViewModel Initialization { get; }
        public InspectorViewModel Inspector { get; }
        public PresetCatalogService PresetCatalog { get; }
        public PresetStateService PresetState { get; }

        private readonly MidiService _midiService;
        private readonly SettingsService _settingsService;
        private readonly AppSettings _appSettings;
        private readonly ProjectService _projectService;
        private AccidentalRule _selectedAccidentalRule;
        private int _pc0NoteIndex;
        private int _pc0Octave;
        private bool _useAmbitus;
        private int _ambitusLowNoteIndex;
        private int _ambitusLowOctave;
        private int _ambitusHighNoteIndex;
        private int _ambitusHighOctave;
        private OrderedUnwrapMode _orderedUnwrapMode;
        private ChordVoicingMode _chordVoicingMode;
        private NotationPreference _defaultNotationMode;
        private NotationPreference _workspacePreviewNotationMode;
        private int _pitchBendRangeSemitones;
        private CompositeTransformLogEntry? _selectedLogEntry;
        private WorkspacePreview? _workspacePreview;
        private string _logDetailsAfter = "Refs after: -";
        private string _logDetailsBefore = "Refs before: -";
        private string _logDetailsOpParams = "Op params: -";
        private string _logDetailsMeta = "Meta: -";
        private readonly Dictionary<Guid, Guid> _lastSelectedLogEntryByComposite = new();
        public ICollectionView TransformLogView { get; }

        public MainViewModel(SettingsService settingsService, AppSettings appSettings, CompositeStore store, ProjectService projectService)
        {
            _settingsService = settingsService;
            _appSettings = appSettings;
            Store = store;
            _projectService = projectService;
            TransformLogView = CollectionViewSource.GetDefaultView(Store.LogEntries);
            TransformLogView.Filter = entry =>
                entry is CompositeTransformLogEntry logEntry
                && Store.SelectedComposite != null
                && logEntry.CompositeId == Store.SelectedComposite.CompositeId;
            _midiService = new MidiService();
            PresetCatalog = new PresetCatalogService();
            PresetState = new PresetStateService();
            _selectedAccidentalRule = _appSettings.AccidentalRule;
            LoadRealizationSettings();
            _midiService.SetPitchBendRangeSemitones(_pitchBendRangeSemitones);
            RefreshMidiDevices();
            PlayCommand = new RelayCommand(async () => await PlayAsync(), () => Store.SelectedState?.PitchRef != null);
            PlayWorkspacePreviewCommand = new RelayCommand(async () => await PlayWorkspacePreviewAsync(), () => WorkspacePreview?.Node != null);
            TestMidiCommand = new RelayCommand(async () => await TestMidiAsync(), () => SelectedMidiDeviceIndex >= 0);
            TestMicrotoneCommand = new RelayCommand(async () => await TestMicrotoneAsync(), () => SelectedMidiDeviceIndex >= 0);
            OpenPitchListCatalogCommand = new RelayCommand(() => PitchListCatalogRequested?.Invoke(this, EventArgs.Empty));
            OpenPitchListCatalogModalCommand = new RelayCommand(() => PitchListCatalogModalRequested?.Invoke(this, EventArgs.Empty));
            NewCompositeCommand = new RelayCommand(CreateComposite);
            DuplicateCompositeCommand = new RelayCommand(DuplicateComposite, () => Store.SelectedComposite != null);
            RenameCompositeCommand = new RelayCommand(RenameComposite, () => Store.SelectedComposite != null);
            DeleteCompositeCommand = new RelayCommand(DeleteComposite, () => Store.SelectedComposite != null && Store.Composites.Count > 1);
            CopySnapshotCommand = new RelayCommand(CopySelectedSnapshot, () => SelectedLogEntry != null);

            Store.PropertyChanged += (_, e) =>
            {
                if (e.PropertyName == nameof(Store.SelectedState))
                {
                    PlayCommand.NotifyCanExecuteChanged();
                    if (Store.SelectedState != null)
                    {
                        var match = GetSelectedCompositeLogEntries()
                            .FirstOrDefault(entry => entry.NewStateId == Store.SelectedState.StateId);
                        if (match != null && !ReferenceEquals(SelectedLogEntry, match))
                        {
                            SelectedLogEntry = match;
                        }
                    }
                }
                else if (e.PropertyName == nameof(Store.LastTransformEntry))
                {
                    var entry = Store.LastTransformEntry;
                    if (entry == null) return;
                    // If there is no active WPF Application or dispatcher (tests), update synchronously.
                    var app = System.Windows.Application.Current;
                    if (app == null || app.Dispatcher == null)
                    {
                        if (Store.SelectedComposite != null && entry.CompositeId == Store.SelectedComposite.CompositeId)
                        {
                            SelectedLogEntry = entry;
                        }
                    }
                    else
                    {
                        app.Dispatcher.BeginInvoke(() =>
                        {
                            if (Store.SelectedComposite != null && entry.CompositeId == Store.SelectedComposite.CompositeId)
                            {
                                SelectedLogEntry = entry;
                            }
                        });
                    }
                }
                else if (e.PropertyName == nameof(Store.SelectedComposite))
                {
                    TransformLogView.Refresh();
                    SelectedLogEntry = GetCompositeSelectedLogEntry();
                    DuplicateCompositeCommand.NotifyCanExecuteChanged();
                    RenameCompositeCommand.NotifyCanExecuteChanged();
                    DeleteCompositeCommand.NotifyCanExecuteChanged();
                }
            };
            Store.Composites.CollectionChanged += (_, _) =>
            {
                DuplicateCompositeCommand.NotifyCanExecuteChanged();
                RenameCompositeCommand.NotifyCanExecuteChanged();
                DeleteCompositeCommand.NotifyCanExecuteChanged();
            };
            Store.LogEntries.CollectionChanged += (_, e) =>
            {
                if (e.Action == System.Collections.Specialized.NotifyCollectionChangedAction.Reset)
                {
                    SelectedLogEntry = GetCompositeSelectedLogEntry();
                    return;
                }
                if (e.NewItems != null && e.NewItems.Count > 0)
                {
                    var entry = e.NewItems[^1] as CompositeTransformLogEntry;
                    if (entry != null
                        && Store.SelectedComposite != null
                        && entry.CompositeId == Store.SelectedComposite.CompositeId)
                    {
                        SelectedLogEntry = entry;
                        return;
                    }
                }
                if (SelectedLogEntry == null)
                {
                    SelectedLogEntry = GetCompositeSelectedLogEntry();
                }
            };

            Initialization = new InitializationViewModel(Store, () => SelectedModulus, _midiService, PresetCatalog, PresetState, GetRealizationConfig);
            Inspector = new InspectorViewModel(Store, _midiService, GetRealizationConfig)
            {
                AccidentalRule = _selectedAccidentalRule
            };
            Inspector.SelectedNotationMode = _defaultNotationMode == NotationPreference.Sequence
                ? InspectorNotationMode.Sequence
                : InspectorNotationMode.Chord;
            SelectedLogEntry = GetCompositeSelectedLogEntry();
        }

        public IRelayCommand PlayCommand { get; }
        public IRelayCommand PlayWorkspacePreviewCommand { get; }
        public IRelayCommand TestMidiCommand { get; }
        public IRelayCommand TestMicrotoneCommand { get; }
        public IRelayCommand OpenPitchListCatalogCommand { get; }
        public IRelayCommand OpenPitchListCatalogModalCommand { get; }
        public IRelayCommand NewCompositeCommand { get; }
        public IRelayCommand DuplicateCompositeCommand { get; }
        public IRelayCommand RenameCompositeCommand { get; }
        public IRelayCommand DeleteCompositeCommand { get; }
        public IRelayCommand CopySnapshotCommand { get; }
        public event EventHandler? PitchListCatalogRequested;
        public event EventHandler? PitchListCatalogModalRequested;

        public AccidentalRule SelectedAccidentalRule
        {
            get => _selectedAccidentalRule;
            set
            {
                if (SetProperty(ref _selectedAccidentalRule, value))
                {
                    _appSettings.AccidentalRule = value;
                    _settingsService.Save(_appSettings);
                    Inspector.AccidentalRule = value;
                }
            }
        }

        public int Pc0NoteIndex
        {
            get => _pc0NoteIndex;
            set
            {
                if (SetProperty(ref _pc0NoteIndex, value))
                {
                    UpdatePc0RefMidi();
                }
            }
        }

        public int Pc0Octave
        {
            get => _pc0Octave;
            set
            {
                if (SetProperty(ref _pc0Octave, value))
                {
                    UpdatePc0RefMidi();
                }
            }
        }

        public bool UseAmbitus
        {
            get => _useAmbitus;
            set
            {
                if (SetProperty(ref _useAmbitus, value))
                {
                    SaveRealizationSettings();
                }
            }
        }

        public int AmbitusLowNoteIndex
        {
            get => _ambitusLowNoteIndex;
            set
            {
                if (SetProperty(ref _ambitusLowNoteIndex, value))
                {
                    UpdateAmbitusMidi();
                }
            }
        }

        public int AmbitusLowOctave
        {
            get => _ambitusLowOctave;
            set
            {
                if (SetProperty(ref _ambitusLowOctave, value))
                {
                    UpdateAmbitusMidi();
                }
            }
        }

        public int AmbitusHighNoteIndex
        {
            get => _ambitusHighNoteIndex;
            set
            {
                if (SetProperty(ref _ambitusHighNoteIndex, value))
                {
                    UpdateAmbitusMidi();
                }
            }
        }

        public int AmbitusHighOctave
        {
            get => _ambitusHighOctave;
            set
            {
                if (SetProperty(ref _ambitusHighOctave, value))
                {
                    UpdateAmbitusMidi();
                }
            }
        }

        public OrderedUnwrapMode OrderedUnwrapMode
        {
            get => _orderedUnwrapMode;
            set
            {
                if (SetProperty(ref _orderedUnwrapMode, value))
                {
                    SaveRealizationSettings();
                }
            }
        }

        public ChordVoicingMode ChordVoicingMode
        {
            get => _chordVoicingMode;
            set
            {
                if (SetProperty(ref _chordVoicingMode, value))
                {
                    SaveRealizationSettings();
                }
            }
        }

        public NotationPreference DefaultNotationMode
        {
            get => _defaultNotationMode;
            set
            {
                if (SetProperty(ref _defaultNotationMode, value))
                {
                    _appSettings.DefaultNotationMode = value;
                    _settingsService.Save(_appSettings);
                    Inspector.SelectedNotationMode = value == NotationPreference.Sequence
                        ? InspectorNotationMode.Sequence
                        : InspectorNotationMode.Chord;
                    WorkspacePreviewNotationMode = value;
                }
            }
        }

        public NotationPreference WorkspacePreviewNotationMode
        {
            get => _workspacePreviewNotationMode;
            set => SetProperty(ref _workspacePreviewNotationMode, value);
        }

        public CompositeTransformLogEntry? SelectedLogEntry
        {
            get => _selectedLogEntry;
            set
            {
                if (SetProperty(ref _selectedLogEntry, value))
                {
                    if (value != null)
                    {
                        var compositeId = value.CompositeId;
                        _lastSelectedLogEntryByComposite[compositeId] = value.EntryId;
                    }
                    UpdateLogDetails();
                    if (value != null && value.NewStateId != Guid.Empty)
                    {
                        var state = Store.States.FirstOrDefault(s => s.StateId == value.NewStateId);
                        if (state != null)
                        {
                            Store.SelectedState = state;
                            if (Store.SelectedComposite != null)
                            {
                                Store.SelectedComposite.CurrentStateId = state.StateId;
                            }
                        }
                    }
                    CopySnapshotCommand.NotifyCanExecuteChanged();
                }
            }
        }

        public WorkspacePreview? WorkspacePreview
        {
            get => _workspacePreview;
            private set => SetProperty(ref _workspacePreview, value);
        }

        public void SetWorkspacePreview(WorkspacePreview? preview)
        {
            WorkspacePreview = preview;
            PlayWorkspacePreviewCommand.NotifyCanExecuteChanged();
        }

        public string LogDetailsAfter
        {
            get => _logDetailsAfter;
            private set => SetProperty(ref _logDetailsAfter, value);
        }

        public string LogDetailsBefore
        {
            get => _logDetailsBefore;
            private set => SetProperty(ref _logDetailsBefore, value);
        }

        public string LogDetailsOpParams
        {
            get => _logDetailsOpParams;
            private set => SetProperty(ref _logDetailsOpParams, value);
        }

        public string LogDetailsMeta
        {
            get => _logDetailsMeta;
            private set => SetProperty(ref _logDetailsMeta, value);
        }

        private async Task PlayAsync()
        {
            var state = Store.SelectedState;
            if (state?.PitchRef != null)
            {
                var node = Store.Nodes.FirstOrDefault(n => n.NodeId == state.PitchRef.Value);
                if (node == null) return;
                var config = GetRealizationConfig();
                var pcs = node.Mode == PcMode.Ordered ? node.Ordered : node.Unordered;
                await _midiService.PlayPcs(pcs, node.Modulus, node.Mode, config);
            }
        }

        private async Task PlayWorkspacePreviewAsync()
        {
            var preview = WorkspacePreview;
            if (preview?.Node == null) return;
            var node = preview.Node;

            var isChord = WorkspacePreviewNotationMode == NotationPreference.Chord;
            var mode = isChord ? PcMode.Unordered : PcMode.Ordered;
            var pcs = isChord
                ? (node.Mode == PcMode.Unordered ? node.Unordered : MusicUtils.NormalizeUnordered(node.Ordered, node.Modulus))
                : (node.Mode == PcMode.Ordered ? node.Ordered : node.Unordered);
            if (pcs.Length == 0) return;

            var config = GetRealizationConfig();
            await _midiService.PlayPcs(pcs, node.Modulus, mode, config);
        }

        public int PitchBendRangeSemitones
        {
            get => _pitchBendRangeSemitones;
            set
            {
                if (SetProperty(ref _pitchBendRangeSemitones, value))
                {
                    SaveRealizationSettings();
                }
            }
        }

        private async Task TestMidiAsync()
        {
            if (!_midiService.IsOpen)
            {
                DialogService.Info(
                    "MIDI Output",
                    "No MIDI output device is open. Select a device and try again.");
                return;
            }
            await _midiService.TestOutput();
        }

        private async Task TestMicrotoneAsync()
        {
            if (!_midiService.IsOpen)
            {
                DialogService.Info(
                    "MIDI Output",
                    "No MIDI output device is open. Select a device and try again.");
                return;
            }
            await _midiService.TestMicrotoneSweep(SelectedModulus, _appSettings.Pc0RefMidi);
        }

        public MidiService MidiService => _midiService;

        public void RefreshMidiDevices()
        {
            MidiDevices.Clear();
            foreach (var d in _midiService.GetDevices()) MidiDevices.Add(new MidiDeviceInfo(d.index, d.name));
            ApplySavedMidiIndex();
        }

        private void ApplySavedMidiIndex()
        {
            if (MidiDevices.Count == 0)
            {
                SelectedMidiDeviceIndex = -1;
                return;
            }

            var desired = _appSettings.SelectedMidiDeviceIndex;
            if (desired >= 0 && desired < MidiDevices.Count)
            {
                SelectedMidiDeviceIndex = desired;
            }
            else
            {
                SelectedMidiDeviceIndex = 0;
            }
        }

        private void LoadRealizationSettings()
        {
            _pc0NoteIndex = ModToNoteIndex(_appSettings.Pc0RefMidi);
            _pc0Octave = MidiToOctave(_appSettings.Pc0RefMidi);
            _useAmbitus = _appSettings.UseAmbitus;
            _ambitusLowNoteIndex = ModToNoteIndex(_appSettings.AmbitusLowMidi);
            _ambitusLowOctave = MidiToOctave(_appSettings.AmbitusLowMidi);
            _ambitusHighNoteIndex = ModToNoteIndex(_appSettings.AmbitusHighMidi);
            _ambitusHighOctave = MidiToOctave(_appSettings.AmbitusHighMidi);
            _orderedUnwrapMode = _appSettings.OrderedUnwrapMode;
            _chordVoicingMode = _appSettings.ChordVoicingMode;
            _defaultNotationMode = _appSettings.DefaultNotationMode;
            _workspacePreviewNotationMode = _appSettings.DefaultNotationMode;
            _pitchBendRangeSemitones = _appSettings.PitchBendRangeSemitones;
        }

        private void UpdatePc0RefMidi()
        {
            _appSettings.Pc0RefMidi = NoteOctaveToMidi(_pc0NoteIndex, _pc0Octave);
            SaveRealizationSettings();
        }

        private void UpdateAmbitusMidi()
        {
            _appSettings.AmbitusLowMidi = NoteOctaveToMidi(_ambitusLowNoteIndex, _ambitusLowOctave);
            _appSettings.AmbitusHighMidi = NoteOctaveToMidi(_ambitusHighNoteIndex, _ambitusHighOctave);
            SaveRealizationSettings();
        }

        private void SaveRealizationSettings()
        {
            _appSettings.UseAmbitus = _useAmbitus;
            _appSettings.OrderedUnwrapMode = _orderedUnwrapMode;
            _appSettings.ChordVoicingMode = _chordVoicingMode;
            _appSettings.PitchBendRangeSemitones = _pitchBendRangeSemitones;
            _settingsService.Save(_appSettings);
            _midiService.SetPitchBendRangeSemitones(_pitchBendRangeSemitones);
            RealizationConfigChanged?.Invoke(this, EventArgs.Empty);
        }

        public event EventHandler? RealizationConfigChanged;

        public RealizationConfig GetRealizationConfig()
        {
            return new RealizationConfig
            {
                Pc0RefMidi = _appSettings.Pc0RefMidi,
                AmbitusLowMidi = _appSettings.UseAmbitus ? _appSettings.AmbitusLowMidi : null,
                AmbitusHighMidi = _appSettings.UseAmbitus ? _appSettings.AmbitusHighMidi : null,
                OrderedUnwrapMode = _appSettings.OrderedUnwrapMode,
                ChordVoicingMode = _appSettings.ChordVoicingMode,
                DefaultNotationMode = _appSettings.DefaultNotationMode
            };
        }

        private void UpdateLogDetails()
        {
            var entry = SelectedLogEntry;
            if (entry == null)
            {
                LogDetailsAfter = "Refs after: -";
                LogDetailsBefore = "Refs before: -";
                LogDetailsOpParams = "Op params: -";
                LogDetailsMeta = "Meta: -";
                return;
            }

            var after = Store.States.FirstOrDefault(s => s.StateId == entry.NewStateId);
            var before = entry.PrevStateId.HasValue
                ? Store.States.FirstOrDefault(s => s.StateId == entry.PrevStateId.Value)
                : null;

            LogDetailsAfter = $"Refs after (NewState):\n{FormatStateSnapshot(after)}";
            LogDetailsBefore = before == null
                ? "Refs before (PrevState): -"
                : $"Refs before (PrevState):\n{FormatStateSnapshot(before)}";

            LogDetailsOpParams = entry.OpParams == null || entry.OpParams.Count == 0
                ? "Op params: -"
                : $"Op params:\n{JsonSerializer.Serialize(entry.OpParams, new JsonSerializerOptions { WriteIndented = true })}";

            LogDetailsMeta = $"Meta:\nEntryId: {entry.EntryId}\nCompositeId: {entry.CompositeId}\nPrevStateId: {entry.PrevStateId?.ToString() ?? "-"}\nNewStateId: {entry.NewStateId}";
        }

        private CompositeTransformLogEntry? GetCompositeSelectedLogEntry()
        {
            var composite = Store.SelectedComposite;
            if (composite == null)
            {
                return null;
            }
            if (_lastSelectedLogEntryByComposite.TryGetValue(composite.CompositeId, out var entryId))
            {
                var entry = GetSelectedCompositeLogEntries().FirstOrDefault(e => e.EntryId == entryId);
                if (entry != null)
                {
                    return entry;
                }
            }
            return GetSelectedCompositeLogEntries().LastOrDefault();
        }

        private IEnumerable<CompositeTransformLogEntry> GetSelectedCompositeLogEntries()
        {
            var composite = Store.SelectedComposite;
            if (composite == null)
            {
                return Enumerable.Empty<CompositeTransformLogEntry>();
            }
            return Store.LogEntries.Where(entry => entry.CompositeId == composite.CompositeId);
        }

        private string FormatStateSnapshot(CompositeState? state)
        {
            if (state == null) return "-";
            return string.Join(Environment.NewLine, new[]
            {
                FormatRefLine("PitchRef", state.PitchRef),
                FormatRefLine("RhythmRef", state.RhythmRef),
                FormatRefLine("RegisterRef", state.RegisterRef),
                FormatRefLine("InstrumentRef", state.InstrumentRef),
                FormatRefLine("VoicingRef", state.VoicingRef),
                FormatRefLine("EventsRef", state.EventsRef)
            });
        }

        private string FormatRefLine(string slot, Guid? nodeId)
        {
            if (!nodeId.HasValue) return $"{slot}: -";
            var node = Store.Nodes.FirstOrDefault(n => n.NodeId == nodeId.Value);
            var prefix = slot switch
            {
                "PitchRef" => "P",
                "RhythmRef" => "R",
                "RegisterRef" => "G",
                "InstrumentRef" => "I",
                "VoicingRef" => "V",
                "EventsRef" => "E",
                _ => "N"
            };
            var shortId = nodeId.Value.ToString("N")[..6];
            if (node == null) return $"{slot}: {prefix}{shortId}";

            var label = string.IsNullOrWhiteSpace(node.Label) ? string.Empty : $" {node.Label}";
            if (node.ValueType == AtomicValueType.PitchList)
            {
                var pcs = node.Mode == PcMode.Ordered ? node.Ordered : node.Unordered;
                var body = node.Mode == PcMode.Ordered
                    ? $"({string.Join(' ', pcs)})"
                    : $"[{string.Join(' ', pcs)}]";
                return $"{slot}: {prefix}{shortId} (PitchList: {body}{label})";
            }

            return $"{slot}: {prefix}{shortId} ({node.ValueType}{label})";
        }

        private void CopySelectedSnapshot()
        {
            if (SelectedLogEntry == null) return;
            var snapshot = string.Join(Environment.NewLine + Environment.NewLine, new[]
            {
                $"Op: {SelectedLogEntry.Op}",
                LogDetailsAfter,
                LogDetailsBefore,
                LogDetailsOpParams
            });
            System.Windows.Clipboard.SetText(snapshot);
        }

        private void CreateComposite()
        {
            var name = DialogService.PromptText("New Composite", "Composite name:", "Untitled");
            if (string.IsNullOrWhiteSpace(name)) return;
            var composite = new Composite { Title = name.Trim() };
            var state = new CompositeState { CompositeId = composite.CompositeId };
            composite.CurrentStateId = state.StateId;
            Store.Composites.Add(composite);
            Store.States.Add(state);
            Store.SelectedComposite = composite;
            Store.SelectedState = state;
        }

        private void DuplicateComposite()
        {
            if (Store.SelectedComposite == null) return;
            var sourceComposite = Store.SelectedComposite;
            var sourceState = Store.GetCurrentState(sourceComposite);
            var name = DialogService.PromptText("Duplicate Composite", "Composite name:", $"{sourceComposite.Title} Copy");
            if (string.IsNullOrWhiteSpace(name)) return;

            var composite = new Composite { Title = name.Trim() };
            var statesToCopy = Store.States
                .Where(s => s.CompositeId == sourceComposite.CompositeId)
                .OrderBy(s => s.CreatedAt)
                .ToList();
            var stateIdMap = new Dictionary<Guid, Guid>();
            foreach (var state in statesToCopy)
            {
                var newState = new CompositeState
                {
                    StateId = Guid.NewGuid(),
                    CompositeId = composite.CompositeId,
                    CreatedAt = state.CreatedAt,
                    PitchRef = state.PitchRef,
                    RhythmRef = state.RhythmRef,
                    RegisterRef = state.RegisterRef,
                    InstrumentRef = state.InstrumentRef,
                    VoicingRef = state.VoicingRef,
                    EventsRef = state.EventsRef,
                    ActivePreview = state.ActivePreview,
                    Label = state.Label
                };
                stateIdMap[state.StateId] = newState.StateId;
                Store.States.Add(newState);
            }

            var logEntries = Store.LogEntries
                .Where(e => e.CompositeId == sourceComposite.CompositeId)
                .OrderBy(e => e.CreatedAt)
                .ToList();
            foreach (var entry in logEntries)
            {
                if (!stateIdMap.TryGetValue(entry.NewStateId, out var newStateId))
                {
                    continue;
                }
                var newEntry = new CompositeTransformLogEntry
                {
                    EntryId = Guid.NewGuid(),
                    CompositeId = composite.CompositeId,
                    PrevStateId = entry.PrevStateId.HasValue && stateIdMap.TryGetValue(entry.PrevStateId.Value, out var prevStateId)
                        ? prevStateId
                        : null,
                    NewStateId = newStateId,
                    CreatedAt = entry.CreatedAt,
                    Op = entry.Op,
                    OpParams = entry.OpParams == null ? null : new Dictionary<string, object>(entry.OpParams),
                    Patch = new CompositeRefPatch
                    {
                        Changes = entry.Patch.Changes
                            .Select(change => new CompositeRefChange
                            {
                                Slot = change.Slot,
                                OldRef = change.OldRef,
                                NewRef = change.NewRef
                            })
                            .ToList()
                    }
                };
                Store.LogEntries.Add(newEntry);
            }

            if (sourceComposite.CurrentStateId.HasValue && stateIdMap.TryGetValue(sourceComposite.CurrentStateId.Value, out var mappedCurrent))
            {
                composite.CurrentStateId = mappedCurrent;
            }
            else if (sourceState?.StateId is Guid fallbackStateId && stateIdMap.TryGetValue(fallbackStateId, out var mappedFallback))
            {
                composite.CurrentStateId = mappedFallback;
            }
            else
            {
                composite.CurrentStateId = stateIdMap.Values.LastOrDefault();
            }

            Store.Composites.Add(composite);
            Store.SelectedComposite = composite;
            Store.SelectedState = composite.CurrentStateId.HasValue
                ? Store.States.FirstOrDefault(s => s.StateId == composite.CurrentStateId.Value)
                : Store.GetCurrentState(composite);
        }

        private void RenameComposite()
        {
            if (Store.SelectedComposite == null) return;
            var current = Store.SelectedComposite.Title;
            var name = DialogService.PromptText("Rename Composite", "Composite name:", current);
            if (string.IsNullOrWhiteSpace(name)) return;
            var selected = Store.SelectedComposite;
            if (selected == null) return;
            selected.Title = name.Trim();
            OnPropertyChanged(nameof(Store.Composites));
        }

        private void DeleteComposite()
        {
            if (Store.SelectedComposite == null || Store.Composites.Count <= 1) return;
            var composite = Store.SelectedComposite;
            var confirmed = DialogService.Confirm(
                "Delete Composite",
                $"Delete composite \"{composite.Title}\"?");
            if (!confirmed) return;

            var statesToRemove = Store.States.Where(s => s.CompositeId == composite.CompositeId).ToList();
            var logsToRemove = Store.LogEntries.Where(e => e.CompositeId == composite.CompositeId).ToList();
            foreach (var log in logsToRemove) Store.LogEntries.Remove(log);
            foreach (var state in statesToRemove) Store.States.Remove(state);
            Store.Composites.Remove(composite);
            Store.SelectedComposite = Store.Composites.FirstOrDefault();
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
    }

    public record MidiDeviceInfo(int Index, string Name);
}
