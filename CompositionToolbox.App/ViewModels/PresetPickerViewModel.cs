using System;
using System.Collections.Generic;
using System.Collections.ObjectModel;
using System.Collections.Concurrent;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using CompositionToolbox.App.Models;
using CompositionToolbox.App.Services;
using System.Diagnostics;

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
        public string NameDisplay => string.IsNullOrWhiteSpace(Preset.DisplayName) ? Preset.Id : Preset.DisplayName;
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
        private readonly ConcurrentDictionary<string, PresetItemViewModel> _itemsById;

        private string _searchQuery = string.Empty;
        private object? _selectedPreset;
        private PresetNotationMode _selectedNotationMode = PresetNotationMode.Chord;
        private AtomicNode? _previewNode;
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

            var sw = Stopwatch.StartNew();
            Results = new ObservableCollection<object>();
            Favorites = new ObservableCollection<PresetItemViewModel>();
            CardinalityOptions = new ObservableCollection<CardinalityOption>();
            _itemsById = new ConcurrentDictionary<string, PresetItemViewModel>(StringComparer.OrdinalIgnoreCase);
            // Bring in any globally precreated items from the PresetItemCache (if present)
            foreach (var vm in PresetItemCache.Values)
            {
                _itemsById[vm.Preset.Id] = vm;
            }

            // Kick off background creation of any remaining item VMs to avoid blocking UI when the user opens the catalog
            _ = Task.Run(() =>
            {
                var swCreate = Stopwatch.StartNew();
                foreach (var p in _catalog.All)
                {
                    // avoid overwriting already cached/precreated instances
                    if (!_itemsById.ContainsKey(p.Id))
                    {
                        var vm = new PresetItemViewModel(p, _state);
                        _itemsById[p.Id] = vm;
                    }
                }
                TimingLogger.Log($"PresetPickerViewModel: background created {_itemsById.Count} items in {swCreate.ElapsedMilliseconds}ms");
            });
            TimingLogger.Log($"PresetPickerViewModel: built _itemsById with {_itemsById.Count} items in {sw.ElapsedMilliseconds}ms");

            SelectPresetCommand = new RelayCommand<PresetItemViewModel?>(SelectPreset, preset => preset != null);
            PlayCommand = new RelayCommand(async () => await PlayAsync(), () => SelectedPreset != null);

            _state.StateChanged += (_, _) => SyncFromState();
            BuildCardinalityOptions();
            SyncFromState();
            UpdateResults();
        }

        public ObservableCollection<object> Results { get; }
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

        public object? SelectedPreset
        {
            get => _selectedPreset;
            set
            {
                if (SetProperty(ref _selectedPreset, value))
                {
                    // If a lightweight model was selected, materialize it eagerly so user actions work immediately
                    if (_selectedPreset is PresetPcSet model)
                    {
                        var idx = Results.IndexOf(model);
                        if (idx >= 0) EnsureMaterialized(model, idx);
                    }

                    UpdateNotationNode();
                    PlayCommand.NotifyCanExecuteChanged();
                }
            }
        }

        public PresetItemViewModel? SelectedPresetVm => _selectedPreset as PresetItemViewModel;

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

        public AtomicNode? PreviewNode
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
            var preset = GetSelectedPresetModel();
            if (preset == null) return false;
            _initialization.ApplyPreset(preset);
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

        private PresetPcSet? GetSelectedPresetModel()
        {
            if (SelectedPresetVm != null) return SelectedPresetVm.Preset;
            if (SelectedPreset is PresetPcSet p) return p;
            return null;
        }

        private async Task PlayAsync()
        {
            var preset = GetSelectedPresetModel();
            if (preset == null) return;
            var pcs = preset.PrimeForm.ToArray();
            var config = _getRealizationConfig();
            if (SelectedNotationMode == PresetNotationMode.Chord)
            {
                await _midiService.PlayPcs(pcs, preset.Modulus, PcMode.Unordered, config);
            }
            else
            {
                await _midiService.PlayPcs(pcs, preset.Modulus, PcMode.Ordered, config);
            }
        }

        private CancellationTokenSource? _populateCts;

        // Materialize a model into a PresetItemViewModel at the given index (called from ListView loader)
        public void EnsureMaterialized(PresetPcSet preset, int index)
        {
            try
            {
                if (index < 0 || index >= Results.Count) return;
                var current = Results[index];
                if (current is PresetItemViewModel) return;
                if (current is PresetPcSet p && !string.Equals(p.Id, preset.Id, StringComparison.OrdinalIgnoreCase)) return;

                var vm = GetOrCreateItem(preset);
                App.Current.Dispatcher.InvokeAsync(() =>
                {
                    try
                    {
                        if (index < 0 || index >= Results.Count) return;
                        if (Results[index] is PresetPcSet q && string.Equals(q.Id, preset.Id, StringComparison.OrdinalIgnoreCase))
                        {
                            Results[index] = vm;
                            TimingLogger.Log($"PresetPickerViewModel: Materialized preset {preset.Id} at index {index}");
                        }
                    }
                    catch (Exception ex)
                    {
                        TimingLogger.Log($"PresetPickerViewModel: Materialize UI replace failed: {ex.Message}");
                    }
                }, System.Windows.Threading.DispatcherPriority.Background);
            }
            catch (Exception ex)
            {
                TimingLogger.Log($"PresetPickerViewModel: EnsureMaterialized failed: {ex.Message}");
            }
        }
        private async void UpdateResults()
        {
            var sw = Stopwatch.StartNew();
            string? previousId = null;
            if (SelectedPresetVm != null) previousId = SelectedPresetVm.Preset.Id;
            else if (SelectedPreset is PresetPcSet sp) previousId = sp.Id;
            _populateCts?.Cancel();
            _populateCts = new CancellationTokenSource();

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

            // Start by clearing and populate first small batch synchronously with lightweight models for snappy UI
            Results.Clear();
            var list = filtered.ToList();
            int initial = Math.Min(40, list.Count);
            for (int i = 0; i < initial; i++)
            {
                Results.Add(list[i]);
            }
            TimingLogger.Log($"PresetPickerViewModel: initial {initial} model items added in {sw.ElapsedMilliseconds}ms");

            // If there are more items, populate them in background batches so UI remains responsive (models only)
            if (list.Count > initial)
            {
                var cts = _populateCts;
                _ = Task.Run(async () =>
                {
                    const int batch = 40;
                    for (int start = initial; start < list.Count; start += batch)
                    {
                        if (cts?.IsCancellationRequested == true) break;
                        var end = Math.Min(start + batch, list.Count);
                        var batchItems = list.GetRange(start, end - start);
                        await App.Current.Dispatcher.InvokeAsync(() =>
                        {
                            foreach (var it in batchItems) Results.Add(it);
                        });
                        try { await Task.Delay(40, cts?.Token ?? CancellationToken.None); } catch { break; }
                    }
                    TimingLogger.Log($"PresetPickerViewModel: finished populating {list.Count} results (models only)");
                }, cts?.Token ?? CancellationToken.None);
            }

            // Update selection with available results (may change as more items arrive)
            if (Results.Count == 0)
            {
                SelectedPreset = null;
                return;
            }

            if (!string.IsNullOrWhiteSpace(previousId))
            {
                object? match = null;
                foreach (var it in Results)
                {
                    if (it is PresetItemViewModel vm && string.Equals(vm.Preset.Id, previousId, StringComparison.OrdinalIgnoreCase)) { match = it; break; }
                    if (it is PresetPcSet p && string.Equals(p.Id, previousId, StringComparison.OrdinalIgnoreCase)) { match = it; break; }
                }
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

            var preset = GetSelectedPresetModel();
            if (preset == null)
            {
                PreviewNode = null;
                PreviewMidiNotes = Array.Empty<int>();
                return;
            }
            var pcs = preset.PrimeForm.ToArray();
            var isChord = SelectedNotationMode == PresetNotationMode.Chord;
            NotationRenderMode = isChord ? "chord" : "line";

            PreviewNode = new AtomicNode
            {
                Modulus = preset.Modulus,
                Mode = isChord ? PcMode.Unordered : PcMode.Ordered,
                Ordered = pcs,
                Unordered = pcs,
                Label = preset.Id,
                OpFromPrev = null
            };

            var config = _getRealizationConfig();
            PreviewMidiNotes = MusicUtils.RealizePcs(pcs, preset.Modulus, isChord ? PcMode.Unordered : PcMode.Ordered, config);
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
            // Ensure any favorites are created quickly so they appear in the Favorites list immediately
            foreach (var id in favorites)
            {
                var preset = _catalog.GetById(id);
                if (preset == null) continue;
                var itm = GetOrCreateItem(preset);
                itm.IsFavorite = true;
            }
            foreach (var item in _itemsById.Values)
            {
                if (!favorites.Contains(item.Preset.Id))
                {
                    item.IsFavorite = false;
                }
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

        private PresetItemViewModel GetOrCreateItem(PresetPcSet preset)
        {
            if (_itemsById.TryGetValue(preset.Id, out var item)) return item;
            var newItem = new PresetItemViewModel(preset, _state);
            _itemsById.TryAdd(preset.Id, newItem);
            return newItem;
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
