using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using CompositionToolbox.App.Models;
using CompositionToolbox.App.Services;
using CompositionToolbox.App.Stores;
using System;
using System.Linq;
using System.Collections.ObjectModel;
using System.Text;
using System.Threading.Tasks;

namespace CompositionToolbox.App.ViewModels
{
    public class InitializationViewModel : ObservableObject
    {
        private readonly TransformLogStore _store;
        private readonly Func<int> _getModulus;
        private readonly MidiService _midiService;
        private readonly PresetCatalogService _presetCatalog;
        private readonly PresetStateService _presetState;
        private readonly Func<RealizationConfig> _getRealizationConfig;

        private string _inputText = string.Empty;
        public string InputText
        {
            get => _inputText;
            set
            {
                SetProperty(ref _inputText, value);
                UpdatePreview();
            }
        }

        private bool _isOrdered = true;
        public bool IsOrdered
        {
            get => _isOrdered;
            set
            {
                if (SetProperty(ref _isOrdered, value))
                {
                    UpdatePreview();
                    OnPropertyChanged(nameof(IsUnordered));
                }
            }
        }

        public bool IsUnordered
        {
            get => !IsOrdered;
            set
            {
                IsOrdered = !value;
                OnPropertyChanged(nameof(IsUnordered));
            }
        }

        private string _preview = string.Empty;
        public string Preview
        {
            get => _preview;
            set => SetProperty(ref _preview, value);
        }

        private PitchNode? _previewNode;
        public PitchNode? PreviewNode
        {
            get => _previewNode;
            private set => SetProperty(ref _previewNode, value);
        }

        private string _normalOrderPreview = string.Empty;
        public string NormalOrderPreview
        {
            get => _normalOrderPreview;
            set => SetProperty(ref _normalOrderPreview, value);
        }

        private string _primeFormPreview = string.Empty;
        public string PrimeFormPreview
        {
            get => _primeFormPreview;
            set => SetProperty(ref _primeFormPreview, value);
        }

        private string _seed = string.Empty;
        private string _rotationSeed = string.Empty;
        public string Seed
        {
            get => _seed;
            set
            {
                if (SetProperty(ref _seed, value))
                {
                    if (IsOrdered && SelectedOrderedOption == OrderedOption.RandomPermutation)
                    {
                        UpdatePreview();
                    }
                    else
                    {
                        UpdatePermutationPreview();
                    }
                }
            }
        }

        private string _permutationPreview = string.Empty;
        public string PermutationPreview
        {
            get => _permutationPreview;
            set => SetProperty(ref _permutationPreview, value);
        }

        public enum OrderedOption { AsEntered, SortedAscending, UniquePreserveOrder, RandomPermutation, RandomRotation }
        public enum UnorderedOption { NormalOrder, PrimeForm }

        private OrderedOption _selectedOrderedOption = OrderedOption.AsEntered;
        public OrderedOption SelectedOrderedOption
        {
            get => _selectedOrderedOption;
            set
            {
                if (SetProperty(ref _selectedOrderedOption, value))
                {
                    UpdatePreview();
                }
            }
        }

        private UnorderedOption _selectedUnorderedOption = UnorderedOption.NormalOrder;
        public UnorderedOption SelectedUnorderedOption
        {
            get => _selectedUnorderedOption;
            set
            {
                if (SetProperty(ref _selectedUnorderedOption, value))
                {
                    UpdatePreview();
                }
            }
        }

        public IRelayCommand CreateStartingObjectCommand { get; }
        public IRelayCommand RandomizePcCommand { get; }
        public IRelayCommand RandomizeSeedCommand { get; }
        public IRelayCommand RandomizeRotationCommand { get; }
        public IRelayCommand PlayInputCommand { get; }
        public IRelayCommand PlayPreviewCommand { get; }
        public IRelayCommand<PresetPcSet?> ApplyPresetCommand { get; }

        public ObservableCollection<PresetPcSet> FavoritePresets { get; } = new ObservableCollection<PresetPcSet>();
        public ObservableCollection<PresetPcSet> RecentPresets { get; } = new ObservableCollection<PresetPcSet>();

        public bool HasFavorites => FavoritePresets.Count > 0;
        public bool HasRecents => RecentPresets.Count > 0;

        public InitializationViewModel(
            TransformLogStore store,
            Func<int> getModulus,
            MidiService midiService,
            PresetCatalogService presetCatalog,
            PresetStateService presetState,
            Func<RealizationConfig> getRealizationConfig)
        {
            _store = store;
            _getModulus = getModulus;
            _midiService = midiService;
            _presetCatalog = presetCatalog;
            _presetState = presetState;
            _getRealizationConfig = getRealizationConfig;
            CreateStartingObjectCommand = new RelayCommand(CreateStartingObject);
            RandomizePcCommand = new RelayCommand(RandomizePc);
            RandomizeSeedCommand = new RelayCommand(RandomizeSeed);
            RandomizeRotationCommand = new RelayCommand(RandomizeRotation);
            PlayInputCommand = new RelayCommand(async () => await PlayInputAsync());
            PlayPreviewCommand = new RelayCommand(async () => await PlayPreviewAsync());
            ApplyPresetCommand = new RelayCommand<PresetPcSet?>(ApplyPreset, preset => preset != null);

            // initialize seed
            Seed = Models.MusicUtils.GenerateRandomBase62(8);

            _presetState.StateChanged += (_, _) => RefreshPresetLists();
            RefreshPresetLists();
        }

        private void UpdatePreview()
        {
            var modulus = _getModulus();
            var pcs = ParseInput(InputText, modulus);
            var unordered = Models.MusicUtils.NormalizeUnordered(pcs, modulus);
            int[] previewPcs;

            if (IsOrdered)
            {
                switch (SelectedOrderedOption)
                {
                    case OrderedOption.AsEntered:
                        previewPcs = pcs;
                        break;
                    case OrderedOption.SortedAscending:
                        previewPcs = pcs.OrderBy(x => x).ToArray();
                        break;
                    case OrderedOption.UniquePreserveOrder:
                        previewPcs = pcs.Where((x, idx) => pcs.Take(idx).All(y => y != x)).ToArray();
                        break;
                    case OrderedOption.RandomPermutation:
                        var unique = pcs.Distinct().ToArray();
                        previewPcs = string.IsNullOrEmpty(Seed) ? Array.Empty<int>() : Models.MusicUtils.ApplyPermutation(unique, Seed);
                        break;
                    case OrderedOption.RandomRotation:
                        previewPcs = ApplyRotation(pcs, EnsureRotationSeed());
                        break;
                    default:
                        previewPcs = pcs;
                        break;
                }
                Preview = $"({string.Join(' ', previewPcs)})";
            }
            else
            {
                switch (SelectedUnorderedOption)
                {
                    case UnorderedOption.NormalOrder:
                        previewPcs = Models.MusicUtils.ComputeNormalOrder(unordered, modulus);
                        break;
                    case UnorderedOption.PrimeForm:
                        previewPcs = Models.MusicUtils.ComputePrimeForm(unordered, modulus);
                        break;
                    default:
                        previewPcs = unordered;
                        break;
                }
                Preview = previewPcs.Length == 0 ? string.Empty : $"[{string.Join(' ', previewPcs)}]";
            }

            // Normal order and prime form (computed from unordered set) for dedicated previews
            NormalOrderPreview = unordered.Length == 0 ? string.Empty : $"[{string.Join(' ', Models.MusicUtils.ComputeNormalOrder(unordered, modulus))}]";
            PrimeFormPreview = Models.MusicUtils.ComputePrimeForm(unordered, modulus) is var pf && pf.Length > 0 ? $"({string.Join(' ', pf)})" : string.Empty;

            PreviewNode = new PitchNode
            {
                Modulus = modulus,
                Mode = IsOrdered ? PcMode.Ordered : PcMode.Unordered,
                Ordered = previewPcs,
                Unordered = IsOrdered ? Models.MusicUtils.NormalizeUnordered(previewPcs, modulus) : previewPcs,
                Label = "Preview",
                OpFromPrev = null
            };

            UpdatePermutationPreview();
        }

        private void UpdatePermutationPreview()
        {
            var pcs = ParseInput(InputText, _getModulus());
            if (string.IsNullOrEmpty(Seed) || pcs.Length == 0)
            {
                PermutationPreview = string.Empty;
                return;
            }
            // Use unique pitch classes when permuting
            var unique = pcs.Distinct().ToArray();
            var permuted = Models.MusicUtils.ApplyPermutation(unique, Seed);
            if (permuted.Length == 0)
            {
                PermutationPreview = string.Empty;
                return;
            }
            PermutationPreview = IsOrdered ? $"({string.Join(' ', permuted)})" : $"[{string.Join(' ', permuted)}]";
        }

        private int[] ParseInput(string text, int modulus)
        {
            if (string.IsNullOrWhiteSpace(text)) return Array.Empty<int>();
            var tokens = text.Split(new[] { ' ', ',', '\t', '\n', '\r' }, StringSplitOptions.RemoveEmptyEntries);
            var list = tokens.Select(t =>
            {
                if (int.TryParse(t, out var v))
                {
                    var n = ((v % modulus) + modulus) % modulus;
                    return n;
                }
                return (int?)null;
            }).Where(x => x.HasValue).Select(x => x!.Value).ToArray();

            if (!IsOrdered)
            {
                list = list.Distinct().OrderBy(x => x).ToArray();
            }
            return list;
        }

        private int[] ParseInputAsEntered(string text, int modulus)
        {
            if (string.IsNullOrWhiteSpace(text)) return Array.Empty<int>();
            var tokens = text.Split(new[] { ' ', ',', '\t', '\n', '\r' }, StringSplitOptions.RemoveEmptyEntries);
            return tokens.Select(t =>
            {
                if (int.TryParse(t, out var v))
                {
                    var n = ((v % modulus) + modulus) % modulus;
                    return (int?)n;
                }
                return (int?)null;
            }).Where(x => x.HasValue).Select(x => x!.Value).ToArray();
        }

        private void RandomizeSeed()
        {
            Seed = Models.MusicUtils.GenerateRandomBase62(8);
        }

        private void RandomizeRotation()
        {
            _rotationSeed = Models.MusicUtils.GenerateRandomBase62(8);
            if (IsOrdered && SelectedOrderedOption == OrderedOption.RandomRotation)
            {
                UpdatePreview();
            }
        }

        private void RandomizePc()
        {
            var modulus = _getModulus();
            var len = new Random().Next(3, Math.Max(4, modulus + 1)); // length in [3, modulus]
            var pcs = Models.MusicUtils.GenerateRandomPcList(modulus, len);
            InputText = string.Join(' ', pcs);
        }

        private async Task PlayInputAsync()
        {
            var modulus = _getModulus();
            var pcs = ParseInputAsEntered(InputText, modulus);
            if (pcs.Length == 0) return;

            var config = _getRealizationConfig();
            var midi = MusicUtils.RealizePcs(pcs, modulus, PcMode.Ordered, config);
            await _midiService.PlayMidiSequence(midi);
        }

        private async Task PlayPreviewAsync()
        {
            if (PreviewNode == null) return;
            var config = _getRealizationConfig();
            var pcs = PreviewNode.Mode == PcMode.Ordered ? PreviewNode.Ordered : PreviewNode.Unordered;
            var midi = MusicUtils.RealizePcs(pcs, PreviewNode.Modulus, PreviewNode.Mode, config);
            if (PreviewNode.Mode == PcMode.Unordered)
            {
                await _midiService.PlayMidiChord(midi);
            }
            else
            {
                await _midiService.PlayMidiSequence(midi);
            }
        }

        public void ApplyPreset(PresetPcSet? preset)
        {
            if (preset == null) return;
            InputText = string.Join(' ', preset.PrimeForm);
            _presetState.AddRecent(preset.Id);
        }

        private string EnsureRotationSeed()
        {
            if (string.IsNullOrEmpty(_rotationSeed))
            {
                _rotationSeed = Models.MusicUtils.GenerateRandomBase62(8);
            }
            return _rotationSeed;
        }

        private static int[] ApplyRotation(int[] pcs, string seed)
        {
            if (pcs == null) return Array.Empty<int>();
            if (pcs.Length <= 1) return pcs.ToArray();
            var offset = (int)(Models.MusicUtils.DecodeBase62(seed) % (ulong)pcs.Length);
            if (offset == 0) return pcs.ToArray();

            var rotated = new int[pcs.Length];
            Array.Copy(pcs, offset, rotated, 0, pcs.Length - offset);
            Array.Copy(pcs, 0, rotated, pcs.Length - offset, offset);
            return rotated;
        }
        private void CreateStartingObject()
        {
            var pcs = ParseInput(InputText, _getModulus());
            var modulus = _getModulus();

            int[] ordered;
            int[] unordered = Models.MusicUtils.NormalizeUnordered(pcs, modulus);

            if (!IsOrdered)
            {
                // unordered node: normalized set; apply selected unordered option to the representative ordered array
                switch (SelectedUnorderedOption)
                {
                    case UnorderedOption.NormalOrder:
                        ordered = Models.MusicUtils.ComputeNormalOrder(unordered, modulus);
                        break;
                    case UnorderedOption.PrimeForm:
                        ordered = Models.MusicUtils.ComputePrimeForm(unordered, modulus);
                        break;
                    default:
                        ordered = unordered;
                        break;
                }
            }
            else
            {
                switch (SelectedOrderedOption)
                {
                    case OrderedOption.AsEntered:
                        ordered = pcs; // as entered, keep duplicates
                        break;
                    case OrderedOption.SortedAscending:
                        ordered = pcs.OrderBy(x => x).ToArray();
                        break;
                    case OrderedOption.UniquePreserveOrder:
                        ordered = pcs.Where((x, idx) => pcs.Take(idx).All(y => y != x)).ToArray();
                        break;
                    case OrderedOption.RandomPermutation:
                        var seedToUse = string.IsNullOrWhiteSpace(Seed) ? Models.MusicUtils.GenerateRandomBase62(8) : Seed;
                        var unique = pcs.Distinct().ToArray();
                        var perm = Models.MusicUtils.ApplyPermutation(unique, seedToUse);
                        ordered = perm;
                        break;
                    case OrderedOption.RandomRotation:
                        ordered = ApplyRotation(pcs, EnsureRotationSeed());
                        break;
                    default:
                        ordered = pcs;
                        break;
                }
            }

            var node = new PitchNode
            {
                Modulus = modulus,
                Mode = IsOrdered ? PcMode.Ordered : PcMode.Unordered,
                Ordered = ordered,
                Unordered = unordered,
                Label = "Input",
                OpFromPrev = new OpDescriptor
                {
                    OpType = "INPUT",
                    OperationLabel = "Input",
                    SourceLens = "Initialization",
                    SourceNodeId = null
                }
            };
            _store.AppendAndSelect(node);
        }

        private void RefreshPresetLists()
        {
            FavoritePresets.Clear();
            foreach (var id in _presetState.Favorites)
            {
                var preset = _presetCatalog.GetById(id);
                if (preset != null)
                {
                    FavoritePresets.Add(preset);
                }
            }

            RecentPresets.Clear();
            foreach (var id in _presetState.Recents)
            {
                var preset = _presetCatalog.GetById(id);
                if (preset != null)
                {
                    RecentPresets.Add(preset);
                }
            }

            OnPropertyChanged(nameof(HasFavorites));
            OnPropertyChanged(nameof(HasRecents));
        }
    }
}
