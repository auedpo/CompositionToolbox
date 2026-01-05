using System;
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

    public sealed class CardinalityOption
    {
        public int? Value { get; set; }
        public string Label { get; set; } = string.Empty;
    }

    public sealed class PresetItemViewModel : ObservableObject
    {
        private const string FavoriteOffIcon = "\uE734";
        private const string FavoriteOnIcon = "\uE735";

        private readonly PresetStateService _state;
        private bool _isFavorite;

        public PresetItemViewModel(PresetPcSet preset, PresetStateService state)
        {
            Preset = preset ?? throw new ArgumentNullException(nameof(preset));
            _state = state ?? throw new ArgumentNullException(nameof(state));
            _isFavorite = _state.IsFavorite(Preset.Id);
            ToggleFavoriteCommand = new RelayCommand(ToggleFavorite);
        }

        public PresetPcSet Preset { get; }

        public string Id => Preset.Id;
        public string PrimeFormDisplay => Preset.PrimeFormDisplay;
        public string NameDisplay => Preset.NameDisplay;
        public string CardinalityValue => Preset.CardinalityValue;
        public string CardinalityDisplay => $"|S| = {Preset.Cardinality}";
        public int IC1 => Preset.IC1;
        public int IC2 => Preset.IC2;
        public int IC3 => Preset.IC3;
        public int IC4 => Preset.IC4;
        public int IC5 => Preset.IC5;
        public int IC6 => Preset.IC6;

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

        public string FavoriteIcon => IsFavorite ? FavoriteOnIcon : FavoriteOffIcon;

        public IRelayCommand ToggleFavoriteCommand { get; }

        private void ToggleFavorite()
        {
            _state.ToggleFavorite(Preset.Id);
        }
    }
}
