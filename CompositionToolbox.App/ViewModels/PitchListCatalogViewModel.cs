// Purpose: Pitch List Catalog view model that exposes state and commands for its associated view.

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
    public class PitchListCatalogViewModel : ObservableObject
    {
        private readonly PresetCatalogService _catalog;
        private readonly PresetStateService _state;
        private readonly MidiService _midiService;
        private AccidentalRule _accidentalRule;
        private readonly Func<RealizationConfig> _getRealizationConfig;
        private readonly ConcurrentDictionary<string, PresetItemViewModel> _itemsById;
        private CancellationTokenSource? _populateCts;

        private string _searchQuery = string.Empty;
        private int? _selectedCardinality;
        private bool _showFavoritesOnly;
        private object? _selectedPreset;
        private PresetNotationMode _selectedNotationMode = PresetNotationMode.Chord;
        private AtomicNode? _previewNode;
        private int[] _previewMidiNotes = Array.Empty<int>();
        private string _notationRenderMode = "chord";

public PitchListCatalogViewModel(PresetCatalogService catalog, PresetStateService state, MidiService midiService, AccidentalRule accidentalRule, Func<RealizationConfig> getRealizationConfig)
        {
            _catalog = catalog;
            _state = state;
            _midiService = midiService;
            _accidentalRule = accidentalRule;
            _getRealizationConfig = getRealizationConfig;
            var sw = Stopwatch.StartNew();
            Results = new ObservableCollection<object>();
            CardinalityOptions = new ObservableCollection<CardinalityOption>();
            _itemsById = new ConcurrentDictionary<string, PresetItemViewModel>(StringComparer.OrdinalIgnoreCase);
            
            foreach (var vm in PresetItemCache.Values)
            {
                _itemsById[vm.Preset.Id] = vm;
            }
            PlayCommand = new RelayCommand(async () => await PlayAsync(), () => SelectedPreset != null);

            _ = Task.Run(() =>
            {
                var swCreate = Stopwatch.StartNew();
                foreach (var p in _catalog.All)
                {
                    if (!_itemsById.ContainsKey(p.Id))
                    {
                        var vm = new PresetItemViewModel(p, _state);
                        _itemsById[p.Id] = vm;
                    }
                }
                TimingLogger.Log($"PitchListCatalogViewModel: background created {_itemsById.Count} items in {swCreate.ElapsedMilliseconds}ms");
            });
            TimingLogger.Log($"PitchListCatalogViewModel: built _itemsById with {_itemsById.Count} items in {sw.ElapsedMilliseconds}ms");

            _state.StateChanged += (_, _) => SyncFromState();
            BuildCardinalityOptions();
            SyncFromState();
            UpdateResults();
        }

        // Store lightweight PresetPcSet instances in Results and materialize to PresetItemViewModel on demand
        public ObservableCollection<object> Results { get; }
        public ObservableCollection<CardinalityOption> CardinalityOptions { get; }
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

        public object? SelectedPreset
        {
            get => _selectedPreset;
            set
            {
                if (SetProperty(ref _selectedPreset, value))
                {
                    // If a lightweight model was selected, materialize it eagerly so preview/play are available immediately
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

            if (string.IsNullOrWhiteSpace(SearchQuery))
            {
                filtered = filtered.OrderBy(p => p.Cardinality).ThenBy(p => p.Id, StringComparer.OrdinalIgnoreCase);
            }
            else
            {
                filtered = filtered.OrderBy(p => p.Id, StringComparer.OrdinalIgnoreCase);
            }

            Results.Clear();
            var list = filtered.ToList();
            int initial = Math.Min(50, list.Count);
            // Add lightweight model items only; materialization will occur on row realization.
            for (int i = 0; i < initial; i++)
            {
                Results.Add(list[i]);
            }
            TimingLogger.Log($"PitchListCatalogViewModel: initial {initial} model items added in {sw.ElapsedMilliseconds}ms");

            if (list.Count > initial)
            {
                var cts = _populateCts;
                _ = Task.Run(async () =>
                {
                    const int batch = 50;
                    for (int start = initial; start < list.Count; start += batch)
                    {
                        if (cts?.IsCancellationRequested == true) break;
                        var end = Math.Min(start + batch, list.Count);
                        var batchItems = list.GetRange(start, end - start);
                        await App.Current.Dispatcher.InvokeAsync(() =>
                        {
                            foreach (var it in batchItems) Results.Add(it);
                        });
                        try { await Task.Delay(30, cts?.Token ?? CancellationToken.None); } catch { break; }
                    }
                    TimingLogger.Log($"PitchListCatalogViewModel: finished populating {list.Count} results (models only)");
                }, cts?.Token ?? CancellationToken.None);
            }

            if (Results.Count == 0)
            {
                SelectedPreset = null;
                return;
            }

            if (!string.IsNullOrWhiteSpace(previousId))
            {
                // Find by id whether item is still a model or already materialized VM
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

        private void SyncFromState()
        {
            UpdateFavoriteFlags();
            if (ShowFavoritesOnly)
            {
                UpdateResults();
            }
        }

        private PresetItemViewModel GetOrCreateItem(PresetPcSet preset)
        {
            if (_itemsById.TryGetValue(preset.Id, out var item)) return item;
            var newItem = new PresetItemViewModel(preset, _state);
            _itemsById.TryAdd(preset.Id, newItem);
            return newItem;
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
            var isChord = SelectedNotationMode == PresetNotationMode.Chord;
            var config = _getRealizationConfig();
            if (isChord)
            {
                await _midiService.PlayPcs(pcs, preset.Modulus, PcMode.Unordered, config);
            }
            else
            {
                await _midiService.PlayPcs(pcs, preset.Modulus, PcMode.Ordered, config);
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

        // Materialize (create VM) for the model at the given index (called from DataGridLoadingRow handler)
        public void EnsureMaterialized(PresetPcSet preset, int index)
        {
            try
            {
                // If the item at index is already a VM or doesn't match the id, skip.
                if (index < 0 || index >= Results.Count) return;
                var current = Results[index];
                if (current is PresetItemViewModel) return;
                if (current is PresetPcSet p && !string.Equals(p.Id, preset.Id, StringComparison.OrdinalIgnoreCase)) return;

                var vm = GetOrCreateItem(preset);
                // Replace model with VM on UI thread if still the same index
                App.Current.Dispatcher.InvokeAsync(() =>
                {
                    try
                    {
                        if (index < 0 || index >= Results.Count) return;
                        if (Results[index] is PresetPcSet q && string.Equals(q.Id, preset.Id, StringComparison.OrdinalIgnoreCase))
                        {
                            Results[index] = vm;
                            TimingLogger.Log($"PitchListCatalogViewModel: Materialized preset {preset.Id} at index {index}");
                        }
                    }
                    catch (Exception ex)
                    {
                        TimingLogger.Log($"PitchListCatalogViewModel: Materialize UI replace failed: {ex.Message}");
                    }
                }, System.Windows.Threading.DispatcherPriority.Background);
            }
            catch (Exception ex)
            {
                TimingLogger.Log($"PitchListCatalogViewModel: EnsureMaterialized failed: {ex.Message}");
            }
        }

        private void UpdateFavoriteFlags()
        {
            var favorites = new HashSet<string>(_state.Favorites, StringComparer.OrdinalIgnoreCase);
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
    }
}
