using System;
using System.Collections.Generic;
using System.Collections.ObjectModel;
using System.Linq;
using CommunityToolkit.Mvvm.ComponentModel;
using CompositionToolbox.App.Models;
using CompositionToolbox.App.Services;

namespace CompositionToolbox.App.ViewModels
{
    public class PitchListCatalogViewModel : ObservableObject
    {
        private readonly PresetCatalogService _catalog;
        private readonly PresetStateService _state;
        private readonly Dictionary<string, PresetItemViewModel> _itemsById;

        private string _searchQuery = string.Empty;
        private int? _selectedCardinality;
        private bool _showFavoritesOnly;
        private PresetItemViewModel? _selectedPreset;

        public PitchListCatalogViewModel(PresetCatalogService catalog, PresetStateService state)
        {
            _catalog = catalog;
            _state = state;
            Results = new ObservableCollection<PresetItemViewModel>();
            CardinalityOptions = new ObservableCollection<CardinalityOption>();
            _itemsById = _catalog.All.ToDictionary(p => p.Id, p => new PresetItemViewModel(p, _state), StringComparer.OrdinalIgnoreCase);

            _state.StateChanged += (_, _) => SyncFromState();
            BuildCardinalityOptions();
            SyncFromState();
            UpdateResults();
        }

        public ObservableCollection<PresetItemViewModel> Results { get; }
        public ObservableCollection<CardinalityOption> CardinalityOptions { get; }

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

        public PresetItemViewModel? SelectedPreset
        {
            get => _selectedPreset;
            set => SetProperty(ref _selectedPreset, value);
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

            if (string.IsNullOrWhiteSpace(SearchQuery))
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

        private void SyncFromState()
        {
            UpdateFavoriteFlags();
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
