using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using System.Collections.ObjectModel;
using System;
using CompositionToolbox.App.Stores;
using CompositionToolbox.App.Models;
using CompositionToolbox.App.Services;
using System.Threading.Tasks;
using System.Linq;

namespace CompositionToolbox.App.ViewModels
{
    public class MainViewModel : ObservableObject
    {
        public TransformLogStore Store { get; }
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
            set => SetProperty(ref _selectedModulus, value);
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

        public MainViewModel(SettingsService settingsService, AppSettings appSettings)
        {
            _settingsService = settingsService;
            _appSettings = appSettings;
            Store = new TransformLogStore();
            _midiService = new MidiService();
            PresetCatalog = new PresetCatalogService();
            PresetState = new PresetStateService();
            _selectedAccidentalRule = _appSettings.AccidentalRule;
            LoadRealizationSettings();
            RefreshMidiDevices();
            PlayCommand = new RelayCommand(async () => await PlayAsync(), () => Store.SelectedNode != null);
            OpenPresetPickerCommand = new RelayCommand(() => PresetPickerRequested?.Invoke(this, EventArgs.Empty));
            Store.PropertyChanged += (_, e) =>
            {
                if (e.PropertyName == nameof(Store.SelectedNode))
                {
                    PlayCommand.NotifyCanExecuteChanged();
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
        }

        public IRelayCommand PlayCommand { get; }
        public IRelayCommand OpenPresetPickerCommand { get; }
        public event EventHandler? PresetPickerRequested;

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
                }
            }
        }

        private async Task PlayAsync()
        {
            var node = Store.SelectedNode;
            if (node != null)
            {
                var config = GetRealizationConfig();
                var midi = MusicUtils.RealizePcs(
                    node.Mode == PcMode.Ordered ? node.Ordered : node.Unordered,
                    node.Modulus,
                    node.Mode,
                    config);
                if (midi.Length == 0) return;

                if (node.Mode == PcMode.Unordered)
                {
                    await _midiService.PlayMidiChord(midi);
                }
                else
                {
                    await _midiService.PlayMidiSequence(midi);
                }
            }
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
            _settingsService.Save(_appSettings);
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
