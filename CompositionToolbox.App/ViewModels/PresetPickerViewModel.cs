using System;
using System.Collections.Generic;
using System.Collections.ObjectModel;
using System.Linq;
using System.Threading.Tasks;
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using CompositionToolbox.App.Models;
using CompositionToolbox.App.Services;

namespace CompositionToolbox.App.ViewModels
{
    public enum PresetNotationMode
    {
        Chord,
        Sequence
    }

    public class PresetItemViewModel : ObservableObject
    {
        private readonly PresetStateService _stateService;
        public PresetPcSet Preset { get; }

        private bool _isFavorite;

        public PresetItemViewModel(PresetPcSet preset, PresetStateService stateService)
        {
            Preset = preset;
            _stateService = stateService;
            ToggleFavoriteCommand = new RelayCommand(() => _stateService.ToggleFavorite(Preset.Id));
        }

        public string Id => Preset.Id;
        public string PrimeFormDisplay => Preset.PrimeFormDisplay;
        public string PrimeFormPlain => Preset.PrimeFormPlain;
        public string DisplayText => Preset.DisplayText;
        public string CardinalityDisplay => $"k={Preset.Cardinality}";
        public string CardinalityValue => Preset.Cardinality.ToString();
        public int IC1 => Preset.IntervalVector.Length > 0 ? Preset.IntervalVector[0] : 0;
        public int IC2 => Preset.IntervalVector.Length > 1 ? Preset.IntervalVector[1] : 0;
        public int IC3 => Preset.IntervalVector.Length > 2 ? Preset.IntervalVector[2] : 0;
        public int IC4 => Preset.IntervalVector.Length > 3 ? Preset.IntervalVector[3] : 0;
        public int IC5 => Preset.IntervalVector.Length > 4 ? Preset.IntervalVector[4] : 0;
        public int IC6 => Preset.IntervalVector.Length > 5 ? Preset.IntervalVector[5] : 0;

        public IRelayCommand ToggleFavoriteCommand { get; }

        public bool IsFavorite
        {
            get => _isFavorite;
            set
            {
                if (SetProperty(ref _isFavorite, value))
                {
                    OnPropertyChanged(nameof(FavoriteIcon));
                }
            }
        }

        public string FavoriteIcon => IsFavorite ? "\uE735" : "\uE734";
    }

    public class CardinalityOption
    {
        public int? Value { get; init; }
        public string Label { get; init; } = string.Empty;
    }

    public class PresetPickerViewModel : ObservableObject
    {
        private readonly PresetCatalogService _catalog;
        private readonly PresetStateService _state;
        private readonly InitializationViewModel _initialization;
        private readonly MidiService _midiService;
        private readonly Func<RealizationConfig> _getRealizationConfig;
        private readonly Dictionary<string, PresetItemViewModel> _itemsById;

        private string _searchQuery = string.Empty;
        private PresetItemViewModel? _selectedPreset;
        private PresetNotationMode _selectedNotationMode = PresetNotationMode.Chord;
        private PitchNode? _previewNode;
        private int[] _previewMidiNotes = Array.Empty<int>();
        private string _notationRenderMode = "chord";
        private AccidentalRule _accidentalRule;
        private int? _selectedCardinality;
        private bool _showFavoritesOnly;
        private string? _sortColumn;
        private bool _sortAscending = true;

        public PresetPickerViewModel(
            PresetCatalogService catalog,
            PresetStateService state,
            InitializationViewModel initialization,
            MidiService midiService,
            AccidentalRule accidentalRule,
            Func<RealizationConfig> getRealizationConfig)
        {
            _catalog = catalog;
            _state = state;
            _initialization = initialization;
            _midiService = midiService;
            _accidentalRule = accidentalRule;
            _getRealizationConfig = getRealizationConfig;

            Results = new ObservableCollection<PresetItemViewModel>();
            Favorites = new ObservableCollection<PresetItemViewModel>();
            CardinalityOptions = new ObservableCollection<CardinalityOption>();
            _itemsById = _catalog.All.ToDictionary(p => p.Id, p => new PresetItemViewModel(p, _state), StringComparer.OrdinalIgnoreCase);

            SelectPresetCommand = new RelayCommand<PresetItemViewModel?>(SelectPreset, preset => preset != null);
            PlayCommand = new RelayCommand(async () => await PlayAsync(), () => SelectedPreset != null);

            _state.StateChanged += (_, _) => SyncFromState();
            BuildCardinalityOptions();
            SyncFromState();
            UpdateResults();
        }

        public ObservableCollection<PresetItemViewModel> Results { get; }
        public ObservableCollection<PresetItemViewModel> Favorites { get; }
        public ObservableCollection<CardinalityOption> CardinalityOptions { get; }

        public IRelayCommand<PresetItemViewModel?> SelectPresetCommand { get; }
        public IRelayCommand PlayCommand { get; }

        public string SearchQuery
        {
            get => _searchQuery;
            set
            {
                if (SetProperty(ref _searchQuery, value))
                {
                    UpdateResults();
                }
            }
        }

        public PresetItemViewModel? SelectedPreset
        {
            get => _selectedPreset;
            set
            {
                if (SetProperty(ref _selectedPreset, value))
                {
                    UpdateNotationNode();
                    PlayCommand.NotifyCanExecuteChanged();
                }
            }
        }

        public PresetNotationMode SelectedNotationMode
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

        public int? SelectedCardinality
        {
            get => _selectedCardinality;
            set
            {
                if (SetProperty(ref _selectedCardinality, value))
                {
                    UpdateResults();
                }
            }
        }

        public bool ShowFavoritesOnly
        {
            get => _showFavoritesOnly;
            set
            {
                if (SetProperty(ref _showFavoritesOnly, value))
                {
                    UpdateResults();
                }
            }
        }

        public void SetSort(string? columnHeader)
        {
            if (string.IsNullOrWhiteSpace(columnHeader))
            {
                _sortColumn = null;
                _sortAscending = true;
                UpdateResults();
                return;
            }

            if (string.Equals(_sortColumn, columnHeader, StringComparison.OrdinalIgnoreCase))
            {
                _sortAscending = !_sortAscending;
            }
            else
            {
                _sortColumn = columnHeader;
                _sortAscending = true;
            }
            UpdateResults();
        }

        public AccidentalRule AccidentalRule
        {
            get => _accidentalRule;
            set => SetProperty(ref _accidentalRule, value);
        }

        public PitchNode? PreviewNode
        {
            get => _previewNode;
            private set => SetProperty(ref _previewNode, value);
        }

        public int[] PreviewMidiNotes
        {
            get => _previewMidiNotes;
            private set => SetProperty(ref _previewMidiNotes, value);
        }

        public string NotationRenderMode
        {
            get => _notationRenderMode;
            private set => SetProperty(ref _notationRenderMode, value);
        }

        public bool HasFavorites => Favorites.Count > 0;

        public bool ApplySelected()
        {
            if (SelectedPreset == null) return false;
            _initialization.ApplyPreset(SelectedPreset.Preset);
            return true;
        }

        public void RefreshRealization()
        {
            UpdateNotationNode();
        }

        private void SelectPreset(PresetItemViewModel? preset)
        {
            if (preset == null) return;
            SelectedPreset = preset;
        }

        private async Task PlayAsync()
        {
            if (SelectedPreset == null) return;
            var pcs = SelectedPreset.Preset.PrimeForm.ToArray();
            var config = _getRealizationConfig();
            if (SelectedNotationMode == PresetNotationMode.Chord)
            {
                var midi = MusicUtils.RealizePcs(pcs, SelectedPreset.Preset.Modulus, PcMode.Unordered, config);
                await _midiService.PlayMidiChord(midi);
            }
            else
            {
                var midi = MusicUtils.RealizePcs(pcs, SelectedPreset.Preset.Modulus, PcMode.Ordered, config);
                await _midiService.PlayMidiSequence(midi);
            }
        }

        private void UpdateResults()
        {
            var previousId = SelectedPreset?.Preset.Id;
            Results.Clear();

            IEnumerable<PresetPcSet> filtered = _catalog.Search(SearchQuery);

            if (SelectedCardinality.HasValue)
            {
                filtered = filtered.Where(p => p.Cardinality == SelectedCardinality.Value);
            }

            if (ShowFavoritesOnly)
            {
                filtered = filtered.Where(p => _state.IsFavorite(p.Id));
            }

            if (!string.IsNullOrWhiteSpace(_sortColumn))
            {
                filtered = ApplySort(filtered, _sortColumn, _sortAscending);
            }
            else if (string.IsNullOrWhiteSpace(SearchQuery))
            {
                filtered = filtered.OrderBy(p => p.Cardinality).ThenBy(p => p.Id, StringComparer.OrdinalIgnoreCase);
            }
            else
            {
                filtered = filtered.OrderBy(p => p.Id, StringComparer.OrdinalIgnoreCase);
            }

            foreach (var preset in filtered)
            {
                if (_itemsById.TryGetValue(preset.Id, out var item))
                {
                    Results.Add(item);
                }
            }

            if (Results.Count == 0)
            {
                SelectedPreset = null;
                return;
            }

            if (!string.IsNullOrWhiteSpace(previousId))
            {
                var match = Results.FirstOrDefault(x => string.Equals(x.Preset.Id, previousId, StringComparison.OrdinalIgnoreCase));
                SelectedPreset = match ?? Results[0];
            }
            else
            {
                SelectedPreset = Results[0];
            }
        }

        private void UpdateNotationNode()
        {
            if (SelectedPreset == null)
            {
                PreviewNode = null;
                PreviewMidiNotes = Array.Empty<int>();
                return;
            }

            var pcs = SelectedPreset.Preset.PrimeForm.ToArray();
            var isChord = SelectedNotationMode == PresetNotationMode.Chord;
            NotationRenderMode = isChord ? "chord" : "line";

            PreviewNode = new PitchNode
            {
                Modulus = SelectedPreset.Preset.Modulus,
                Mode = isChord ? PcMode.Unordered : PcMode.Ordered,
                Ordered = pcs,
                Unordered = pcs,
                Label = SelectedPreset.Preset.Id,
                OpFromPrev = null
            };

            var config = _getRealizationConfig();
            PreviewMidiNotes = MusicUtils.RealizePcs(pcs, SelectedPreset.Preset.Modulus, isChord ? PcMode.Unordered : PcMode.Ordered, config);
        }

        private void SyncFromState()
        {
            UpdateFavoriteFlags();
            RefreshFavorites();
            if (ShowFavoritesOnly)
            {
                UpdateResults();
            }
        }

        private void UpdateFavoriteFlags()
        {
            var favorites = new HashSet<string>(_state.Favorites, StringComparer.OrdinalIgnoreCase);
            foreach (var item in _itemsById.Values)
            {
                item.IsFavorite = favorites.Contains(item.Preset.Id);
            }
        }

        private void RefreshFavorites()
        {
            Favorites.Clear();
            foreach (var id in _state.Favorites)
            {
                if (_itemsById.TryGetValue(id, out var preset))
                {
                    Favorites.Add(preset);
                }
            }
            OnPropertyChanged(nameof(HasFavorites));
        }

        private void BuildCardinalityOptions()
        {
            CardinalityOptions.Clear();
            CardinalityOptions.Add(new CardinalityOption { Value = null, Label = "All" });
            for (int i = 1; i <= 12; i++)
            {
                CardinalityOptions.Add(new CardinalityOption { Value = i, Label = i.ToString() });
            }
            SelectedCardinality = null;
        }

        private static IEnumerable<PresetPcSet> ApplySort(IEnumerable<PresetPcSet> source, string column, bool ascending)
        {
            Func<PresetPcSet, object> keySelector = column switch
            {
                "Prime form" => p => p.PrimeFormPlain,
                "k" => p => p.Cardinality,
                "Forte" => p => p.Id,
                "Name" => p => p.Id,
                "IC1" => p => p.IntervalVector.Length > 0 ? p.IntervalVector[0] : 0,
                "IC2" => p => p.IntervalVector.Length > 1 ? p.IntervalVector[1] : 0,
                "IC3" => p => p.IntervalVector.Length > 2 ? p.IntervalVector[2] : 0,
                "IC4" => p => p.IntervalVector.Length > 3 ? p.IntervalVector[3] : 0,
                "IC5" => p => p.IntervalVector.Length > 4 ? p.IntervalVector[4] : 0,
                "IC6" => p => p.IntervalVector.Length > 5 ? p.IntervalVector[5] : 0,
                _ => p => p.Id
            };

            return ascending ? source.OrderBy(keySelector) : source.OrderByDescending(keySelector);
        }
    }
}
