using System;
using System.Collections.Generic;
using System.Collections.ObjectModel;
using System.Linq;
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using CompositionToolbox.App.Models;
using CompositionToolbox.App.Services;
using CompositionToolbox.App.Stores;

namespace CompositionToolbox.App.ViewModels
{
    public sealed class AcdlResultRow
    {
        public AcdlResultRow(
            int anchorGapIndex,
            int fixedGap,
            int[] inputCint,
            int[] projectedCint,
            int[] resultPitchList,
            int scaledFreeSum,
            int targetFreeSum,
            bool isValid,
            string status)
        {
            AnchorGapIndex = anchorGapIndex;
            FixedGap = fixedGap;
            InputCint = inputCint ?? Array.Empty<int>();
            ProjectedCint = projectedCint ?? Array.Empty<int>();
            ResultPitchList = resultPitchList ?? Array.Empty<int>();
            ScaledFreeSum = scaledFreeSum;
            TargetFreeSum = targetFreeSum;
            IsValid = isValid;
            Status = status;
            DistinctPcCount = ResultPitchList.Distinct().Count();
        }

        public int AnchorGapIndex { get; }
        public int FixedGap { get; }
        public int[] InputCint { get; }
        public int[] ProjectedCint { get; }
        public int[] ResultPitchList { get; }
        public int ScaledFreeSum { get; }
        public int TargetFreeSum { get; }
        public bool IsValid { get; }
        public string Status { get; }
        public int DistinctPcCount { get; }

        public string InputCintDisplay => $"[{string.Join(' ', InputCint)}]";
        public string ProjectedCintDisplay => ProjectedCint.Length == 0 ? "-" : $"[{string.Join(' ', ProjectedCint)}]";
        public string ResultDisplay => ResultPitchList.Length == 0 ? "-" : $"({string.Join(' ', ResultPitchList)})";
        public string DistinctDisplay => ResultPitchList.Length == 0 ? "-" : $"u={DistinctPcCount}/{ResultPitchList.Length}";
    }

    public sealed class AcdlMultiResultRow
    {
        public AcdlMultiResultRow(
            int anchorGapIndex,
            Dictionary<int, string> resultsByP,
            Dictionary<int, AcdlProjectionTrace> tracesByP,
            List<AcdlPlateau> plateaus,
            Dictionary<string, int> firstOccurrenceBySignature,
            int uniqueCount,
            int uniqueBeforeSaturation,
            int preSaturationRangeCount,
            int maxPlateauLength,
            string plateauSummary,
            bool isFullySaturated,
            string saturationTooltip,
            string saturationReason,
            string saturationAtDisplay,
            string saturationAtTooltip,
            string uniqueCountTooltip)
        {
            AnchorGapIndex = anchorGapIndex;
            ResultsByP = resultsByP ?? new Dictionary<int, string>();
            TracesByP = tracesByP ?? new Dictionary<int, AcdlProjectionTrace>();
            Plateaus = plateaus ?? new List<AcdlPlateau>();
            FirstOccurrenceBySignature = firstOccurrenceBySignature ?? new Dictionary<string, int>();
            UniqueCount = uniqueCount;
            UniqueBeforeSaturation = uniqueBeforeSaturation;
            PreSaturationRangeCount = preSaturationRangeCount;
            MaxPlateauLength = maxPlateauLength;
            PlateauSummary = plateauSummary;
            IsFullySaturated = isFullySaturated;
            SaturationTooltip = saturationTooltip;
            SaturationReason = saturationReason;
            SaturationAtDisplay = saturationAtDisplay;
            SaturationAtTooltip = saturationAtTooltip;
            UniqueCountTooltip = uniqueCountTooltip;
        }

        public int AnchorGapIndex { get; }
        public IReadOnlyDictionary<int, string> ResultsByP { get; }
        public IReadOnlyDictionary<int, AcdlProjectionTrace> TracesByP { get; }
        public IReadOnlyList<AcdlPlateau> Plateaus { get; }
        public IReadOnlyDictionary<string, int> FirstOccurrenceBySignature { get; }
        public int UniqueCount { get; }
        public int UniqueBeforeSaturation { get; }
        public int PreSaturationRangeCount { get; }
        public int MaxPlateauLength { get; }
        public string PlateauSummary { get; }
        public bool IsFullySaturated { get; }
        public string SaturationTooltip { get; }
        public string SaturationReason { get; }
        public string SaturationAtDisplay { get; }
        public string SaturationAtTooltip { get; }
        public string UniqueCountTooltip { get; }

        public string AnchorDisplay => IsFullySaturated ? $"{AnchorGapIndex} Ⓢ" : AnchorGapIndex.ToString();
        public string UniqueBeforeSaturationDisplay => UniqueBeforeSaturation.ToString();

        public string this[int p] => ResultsByP.TryGetValue(p, out var value) ? value : "-";
    }

    public sealed class AcdlProjectionTrace
    {
        public AcdlProjectionTrace(
            int p,
            bool isValid,
            string signature,
            int[] projectedGaps,
            int[] resultPitchList,
            int fixedGap,
            int scaledFreeSum,
            int targetFreeSum,
            AcdlProjectionDetails details)
        {
            P = p;
            IsValid = isValid;
            Signature = signature ?? string.Empty;
            ProjectedGaps = projectedGaps ?? Array.Empty<int>();
            ResultPitchList = resultPitchList ?? Array.Empty<int>();
            FixedGap = fixedGap;
            ScaledFreeSum = scaledFreeSum;
            TargetFreeSum = targetFreeSum;
            Details = details ?? new AcdlProjectionDetails();
        }

        public int P { get; }
        public bool IsValid { get; }
        public string Signature { get; }
        public int[] ProjectedGaps { get; }
        public int[] ResultPitchList { get; }
        public int FixedGap { get; }
        public int ScaledFreeSum { get; }
        public int TargetFreeSum { get; }
        public AcdlProjectionDetails Details { get; }
    }

    public sealed class AcdlPlateau
    {
        public AcdlPlateau(int pStart, int pEnd, string signature, int[] projectedGaps, int[] resultPitchList)
        {
            PStart = pStart;
            PEnd = pEnd;
            Signature = signature ?? string.Empty;
            ProjectedGaps = projectedGaps ?? Array.Empty<int>();
            ResultPitchList = resultPitchList ?? Array.Empty<int>();
        }

        public int PStart { get; }
        public int PEnd { get; }
        public string Signature { get; }
        public int[] ProjectedGaps { get; }
        public int[] ResultPitchList { get; }
        public int Length => PEnd - PStart + 1;
    }

    public sealed class AcdlLensViewModel : ObservableObject, ILensPreviewSource, ILensActivation
    {
        private readonly record struct SaturationMetrics(
            string SaturationAtDisplay,
            int UniqueBeforeSaturation,
            int PreSaturationRangeCount);
        private readonly record struct MultiDescriptorCacheKey(
            Guid? SourceNodeId,
            int Modulus,
            AcdlProjectionMode ProjectionMode,
            bool RetainAnchorGapPcs,
            int AnchorIndex,
            string PRangeKey);

        private sealed class AcdlMultiDescriptorCacheEntry
        {
            public Dictionary<int, string> ResultsByP { get; init; } = new();
            public Dictionary<int, AcdlProjectionTrace> TracesByP { get; init; } = new();
            public List<AcdlPlateau> Plateaus { get; init; } = new();
            public Dictionary<string, int> FirstOccurrenceBySignature { get; init; } = new();
            public int UniqueCount { get; init; }
            public int UniqueBeforeSaturation { get; init; }
            public int PreSaturationRangeCount { get; init; }
            public int MaxPlateauLength { get; init; }
            public string PlateauSummary { get; init; } = string.Empty;
            public bool IsFullySaturated { get; init; }
            public string SaturationTooltip { get; init; } = string.Empty;
            public string SaturationReason { get; init; } = string.Empty;
            public string SaturationAtDisplay { get; init; } = string.Empty;
            public string SaturationAtTooltip { get; init; } = string.Empty;
            public string UniqueCountTooltip { get; init; } = string.Empty;
        }

        private readonly CompositeStore _store;
        private AtomicNode? _sourceNode;
        private int[] _sourceOrdered = Array.Empty<int>();
        private int[] _inputCint = Array.Empty<int>();
        private int _modulus;
        private bool _hasPitchSource;
        private bool _isOrderedSource;
        private bool _hasUniqueSource;
        private bool _hasValidSource;
        private bool _isActive;
        private bool _pendingUpdate;
        private string _pInput = "2";
        private string _multiPInput = "1-6";
        private int _p = 2;
        private AcdlProjectionMode _projectionMode = AcdlProjectionMode.TrimLargest;
        private bool _retainAnchorGapPcs = true;
        private string _statusText = string.Empty;
        private string _sourceDisplay = string.Empty;
        private string _inputCintDisplay = string.Empty;
        private AcdlResultRow? _selectedResult;
        private int? _selectedMultiAnchorIndex;
        private int? _selectedMultiP;
        private WorkspacePreview? _workspacePreview;
        private List<int> _multiPValues = new();
        private string _multiResultsSummary = string.Empty;
        private string _selectedMultiSummary = string.Empty;
        private readonly Dictionary<MultiDescriptorCacheKey, AcdlMultiDescriptorCacheEntry> _multiDescriptorCache = new();
        private readonly Dictionary<int, SaturationMetrics> _saturationMetricsCache = new();
        private static readonly int[] SaturationPValues = Enumerable.Range(1, 16).ToArray();

        public AcdlLensViewModel(CompositeStore store)
        {
            _store = store;
            Results = new ObservableCollection<AcdlResultRow>();
            MultiResults = new ObservableCollection<AcdlMultiResultRow>();
            CommitSelectedCommand = new RelayCommand(CommitSelected, CanCommitSelected);
            CommitRowCommand = new RelayCommand<AcdlResultRow>(CommitRow, row => row != null && row.IsValid);
            DedupeCommand = new RelayCommand(DedupeSource, () => HasPitchSource && IsOrderedSource && !HasUniqueSource);
            CreateOrderedFromUnorderedCommand = new RelayCommand(CreateOrderedFromUnordered, () => HasPitchSource && !IsOrderedSource);

            _store.PropertyChanged += (_, e) =>
            {
                if (e.PropertyName == nameof(CompositeStore.SelectedState))
                {
                    UpdateFromSelectedState();
                }
            };
            _store.Nodes.CollectionChanged += (_, _) => UpdateFromSelectedState();
            UpdateMultiPValues(_multiPInput);
        }

        public ObservableCollection<AcdlResultRow> Results { get; }
        public ObservableCollection<AcdlMultiResultRow> MultiResults { get; }

        public string PInput
        {
            get => _pInput;
            set
            {
                if (SetProperty(ref _pInput, value))
                {
                    if (int.TryParse(value, out var parsed))
                    {
                        if (parsed < 1) parsed = 1;
                        P = parsed;
                    }
                    else
                    {
                        Recompute();
                    }
                }
            }
        }

        public string MultiPInput
        {
            get => _multiPInput;
            set
            {
                if (SetProperty(ref _multiPInput, value))
                {
                    UpdateMultiPValues(value);
                }
            }
        }

        public IReadOnlyList<int> MultiPValues => _multiPValues;

        public bool HasMultiPValues => _multiPValues.Count > 0;

        public string MultiResultsSummary
        {
            get => _multiResultsSummary;
            private set => SetProperty(ref _multiResultsSummary, value);
        }

        public string SelectedMultiSummary
        {
            get => _selectedMultiSummary;
            private set => SetProperty(ref _selectedMultiSummary, value);
        }

        public int P
        {
            get => _p;
            private set
            {
                if (SetProperty(ref _p, value))
                {
                    Recompute();
                }
            }
        }

        public AcdlProjectionMode ProjectionMode
        {
            get => _projectionMode;
            set
            {
                if (SetProperty(ref _projectionMode, value))
                {
                    Recompute();
                }
            }
        }

        public Array ProjectionModes => Enum.GetValues<AcdlProjectionMode>();

        public bool RetainAnchorGapPcs
        {
            get => _retainAnchorGapPcs;
            set
            {
                if (SetProperty(ref _retainAnchorGapPcs, value))
                {
                    Recompute();
                }
            }
        }

        public bool HasPitchSource
        {
            get => _hasPitchSource;
            private set
            {
                if (SetProperty(ref _hasPitchSource, value))
                {
                    DedupeCommand.NotifyCanExecuteChanged();
                    CreateOrderedFromUnorderedCommand.NotifyCanExecuteChanged();
                    OnPropertyChanged(nameof(CanDedupe));
                }
            }
        }

        public bool IsOrderedSource
        {
            get => _isOrderedSource;
            private set
            {
                if (SetProperty(ref _isOrderedSource, value))
                {
                    DedupeCommand.NotifyCanExecuteChanged();
                    CreateOrderedFromUnorderedCommand.NotifyCanExecuteChanged();
                    OnPropertyChanged(nameof(CanDedupe));
                }
            }
        }

        public bool HasUniqueSource
        {
            get => _hasUniqueSource;
            private set
            {
                if (SetProperty(ref _hasUniqueSource, value))
                {
                    DedupeCommand.NotifyCanExecuteChanged();
                    OnPropertyChanged(nameof(CanDedupe));
                }
            }
        }

        public bool HasValidSource
        {
            get => _hasValidSource;
            private set
            {
                if (SetProperty(ref _hasValidSource, value))
                {
                    CommitSelectedCommand.NotifyCanExecuteChanged();
                    OnPropertyChanged(nameof(ShowMultiResults));
                    OnPropertyChanged(nameof(ShowSingleResults));
                }
            }
        }

        public bool ShowMultiResults => HasValidSource && HasMultiPValues;
        public bool ShowSingleResults => HasValidSource && !HasMultiPValues;

        public bool CanDedupe => HasPitchSource && IsOrderedSource && !HasUniqueSource;

        public string StatusText
        {
            get => _statusText;
            private set
            {
                if (SetProperty(ref _statusText, value))
                {
                    OnPropertyChanged(nameof(HasStatusText));
                }
            }
        }

        public bool HasStatusText => !string.IsNullOrWhiteSpace(StatusText);

        public string SourceDisplay
        {
            get => _sourceDisplay;
            private set => SetProperty(ref _sourceDisplay, value);
        }

        public string InputCintDisplay
        {
            get => _inputCintDisplay;
            private set => SetProperty(ref _inputCintDisplay, value);
        }

        public AcdlResultRow? SelectedResult
        {
            get => _selectedResult;
            set
            {
                if (SetProperty(ref _selectedResult, value))
                {
                    if (value != null)
                    {
                        ClearMultiSelection();
                    }
                    UpdateWorkspacePreview(value);
                    CommitSelectedCommand.NotifyCanExecuteChanged();
                }
            }
        }

        public int? SelectedMultiAnchorIndex
        {
            get => _selectedMultiAnchorIndex;
            set
            {
                if (SetProperty(ref _selectedMultiAnchorIndex, value))
                {
                    UpdateMultiSelectionPreview();
                    UpdateSelectedMultiSummary();
                    CommitSelectedCommand.NotifyCanExecuteChanged();
                }
            }
        }

        public int? SelectedMultiP
        {
            get => _selectedMultiP;
            set
            {
                if (SetProperty(ref _selectedMultiP, value))
                {
                    UpdateMultiSelectionPreview();
                    UpdateSelectedMultiSummary();
                    CommitSelectedCommand.NotifyCanExecuteChanged();
                }
            }
        }

        public WorkspacePreview? WorkspacePreview => _workspacePreview;

        public IRelayCommand CommitSelectedCommand { get; }
        public IRelayCommand<AcdlResultRow> CommitRowCommand { get; }
        public IRelayCommand DedupeCommand { get; }
        public IRelayCommand CreateOrderedFromUnorderedCommand { get; }

        public void Activate()
        {
            if (_isActive) return;
            _isActive = true;
            if (_pendingUpdate)
            {
                UpdateFromSelectedState();
                return;
            }
            UpdateFromSelectedState();
        }

        public void Deactivate()
        {
            _isActive = false;
        }

        private void UpdateFromSelectedState()
        {
            if (!_isActive)
            {
                _pendingUpdate = true;
                return;
            }

            var state = _store.SelectedState;
            AtomicNode? node = null;
            if (state?.PitchRef != null)
            {
                node = _store.Nodes.FirstOrDefault(n => n.NodeId == state.PitchRef.Value);
            }
            SetSourceNode(node);
            _pendingUpdate = false;
        }

        private void SetSourceNode(AtomicNode? node)
        {
            var previousNodeId = _sourceNode?.NodeId;
            _sourceNode = node;
            if (previousNodeId != node?.NodeId)
            {
                _multiDescriptorCache.Clear();
            }
            if (node == null || node.ValueType != AtomicValueType.PitchList)
            {
                ClearSource();
                return;
            }

            HasPitchSource = true;
            _modulus = node.Modulus;
            _sourceOrdered = node.Mode == PcMode.Ordered ? node.Ordered : node.Unordered;
            IsOrderedSource = IsAscending(_sourceOrdered);
            CreateOrderedFromUnorderedCommand.NotifyCanExecuteChanged();
            SourceDisplay = _sourceOrdered.Length == 0 ? string.Empty : $"({string.Join(' ', _sourceOrdered)})";

            if (!IsOrderedSource)
            {
                StatusText = "ACDL requires a strictly ascending PitchList (no duplicates).";
                HasUniqueSource = false;
                HasValidSource = false;
                InputCintDisplay = string.Empty;
                ClearResults();
                return;
            }

            if (_sourceOrdered.Length < 2)
            {
                StatusText = "PitchList needs at least 2 pcs.";
                HasUniqueSource = true;
                HasValidSource = false;
                InputCintDisplay = string.Empty;
                ClearResults();
                return;
            }

            HasUniqueSource = _sourceOrdered.Distinct().Count() == _sourceOrdered.Length;
            if (!HasUniqueSource)
            {
                StatusText = "PitchList has duplicates. Dedupe to continue.";
                HasValidSource = false;
                InputCintDisplay = string.Empty;
                ClearResults();
                return;
            }

            _inputCint = AcdlMath.ComputeCint(_sourceOrdered, _modulus);
            InputCintDisplay = _inputCint.Length == 0 ? string.Empty : $"[{string.Join(' ', _inputCint)}]";
            StatusText = string.Empty;
            HasValidSource = true;
            Recompute();
        }

        private void ClearSource()
        {
            _sourceOrdered = Array.Empty<int>();
            _inputCint = Array.Empty<int>();
            _modulus = 0;
            HasPitchSource = false;
            IsOrderedSource = false;
            HasUniqueSource = false;
            HasValidSource = false;
            StatusText = "Select a strictly ascending PitchList (no duplicates).";
            SourceDisplay = string.Empty;
            InputCintDisplay = string.Empty;
            ClearResults();
        }

        private void ClearResults()
        {
            Results.Clear();
            SelectedResult = null;
            _workspacePreview = null;
            OnPropertyChanged(nameof(WorkspacePreview));
            ClearMultiResults();
            ClearMultiSelection();
            _saturationMetricsCache.Clear();
        }

        private void ClearMultiResults()
        {
            MultiResults.Clear();
            MultiResultsSummary = string.Empty;
            UpdateSelectedMultiSummary();
        }

        private void Recompute()
        {
            if (!_isActive) return;
            if (!HasValidSource || _inputCint.Length == 0)
            {
                ClearResults();
                return;
            }

            PrecomputeSaturationCache();
            RecomputeSingleResults();
            RecomputeMultiResults();
        }

        private void RecomputeSingleResults()
        {
            Results.Clear();
            var k = _inputCint.Length;
            for (int a = 0; a < k; a++)
            {
                var ok = AcdlMath.TryProjectGaps(
                    _inputCint,
                    _modulus,
                    a,
                    P,
                    ProjectionMode,
                    out var fixedGap,
                    out var projectedCint,
                    out var scaledFreeSum,
                    out var targetFreeSum,
                    out var invalidReason);

                if (!ok)
                {
                    Results.Add(new AcdlResultRow(
                        a,
                        fixedGap,
                        _inputCint,
                        Array.Empty<int>(),
                        Array.Empty<int>(),
                        scaledFreeSum,
                        targetFreeSum,
                        false,
                        invalidReason ?? "Invalid"));
                    continue;
                }

                var resultList = BuildResultList(a, projectedCint);
                Results.Add(new AcdlResultRow(
                    a,
                    fixedGap,
                    _inputCint,
                    projectedCint,
                    resultList,
                    scaledFreeSum,
                    targetFreeSum,
                    true,
                    "OK"));
            }

            SelectedResult = Results.FirstOrDefault(r => r.IsValid) ?? Results.FirstOrDefault();
            OnPropertyChanged(nameof(Results));
        }

        private void RecomputeMultiResults()
        {
            if (_multiPValues.Count == 0)
            {
                ClearMultiResults();
                OnPropertyChanged(nameof(ShowMultiResults));
                return;
            }

            MultiResults.Clear();
            var orderedPs = _multiPValues.OrderBy(p => p).ToArray();
            var pRangeKey = string.Join(",", orderedPs);
            var k = _inputCint.Length;
            for (int a = 0; a < k; a++)
            {
                var cacheKey = new MultiDescriptorCacheKey(
                    _sourceNode?.NodeId,
                    _modulus,
                    ProjectionMode,
                    RetainAnchorGapPcs,
                    a,
                    pRangeKey);

                if (!_multiDescriptorCache.TryGetValue(cacheKey, out var entry))
                {
                    entry = BuildMultiDescriptorCacheEntry(a, _multiPValues, orderedPs);
                    _multiDescriptorCache[cacheKey] = entry;
                }

                MultiResults.Add(new AcdlMultiResultRow(
                    a,
                    entry.ResultsByP,
                    entry.TracesByP,
                    entry.Plateaus,
                    entry.FirstOccurrenceBySignature,
                    entry.UniqueCount,
                    entry.UniqueBeforeSaturation,
                    entry.PreSaturationRangeCount,
                    entry.MaxPlateauLength,
                    entry.PlateauSummary,
                    entry.IsFullySaturated,
                    entry.SaturationTooltip,
                    entry.SaturationReason,
                    entry.SaturationAtDisplay,
                    entry.SaturationAtTooltip,
                    entry.UniqueCountTooltip));
            }
            UpdateMultiResultsSummary();
            UpdateSelectedMultiSummary();
            OnPropertyChanged(nameof(ShowMultiResults));
        }

        private int[] BuildResultList(int anchorIndex, int[] projectedCint)
        {
            if (RetainAnchorGapPcs)
            {
                var rotatedGaps = new int[projectedCint.Length];
                for (int i = 0; i < projectedCint.Length; i++)
                {
                    rotatedGaps[i] = projectedCint[(anchorIndex + i) % projectedCint.Length];
                }
                return AcdlMath.BuildPitchListFromGaps(_sourceOrdered[anchorIndex], rotatedGaps, _modulus);
            }
            return AcdlMath.BuildPitchListFromGaps(_sourceOrdered[0], projectedCint, _modulus);
        }

        private AcdlProjectionTrace BuildProjectionTrace(int anchorIndex, int p)
        {
            var ok = AcdlMath.TryProjectGaps(
                _inputCint,
                _modulus,
                anchorIndex,
                p,
                ProjectionMode,
                out var fixedGap,
                out var projectedCint,
                out var scaledFreeSum,
                out var targetFreeSum,
                out _,
                out var details);

            if (!ok)
            {
                return new AcdlProjectionTrace(
                    p,
                    false,
                    "INVALID",
                    Array.Empty<int>(),
                    Array.Empty<int>(),
                    fixedGap,
                    scaledFreeSum,
                    targetFreeSum,
                    details);
            }

            var resultList = BuildResultList(anchorIndex, projectedCint);
            var signature = string.Join(",", projectedCint);
            return new AcdlProjectionTrace(
                p,
                true,
                signature,
                projectedCint,
                resultList,
                fixedGap,
                scaledFreeSum,
                targetFreeSum,
                details);
        }

        private AcdlMultiDescriptorCacheEntry BuildMultiDescriptorCacheEntry(
            int anchorIndex,
            IReadOnlyList<int> pValues,
            IReadOnlyList<int> orderedPs)
        {
            var resultsByP = new Dictionary<int, string>();
            var tracesByP = new Dictionary<int, AcdlProjectionTrace>();
            foreach (var p in pValues)
            {
                var trace = BuildProjectionTrace(anchorIndex, p);
                tracesByP[p] = trace;
                resultsByP[p] = trace.ResultPitchList.Length == 0 ? "-" : $"({string.Join(' ', trace.ResultPitchList)})";
            }

            var firstOccurrenceBySignature = new Dictionary<string, int>();
            var plateaus = BuildPlateaus(orderedPs, tracesByP, firstOccurrenceBySignature);
            var uniqueCount = firstOccurrenceBySignature.Count;

            var maxPlateau = plateaus.OrderByDescending(p => p.Length).FirstOrDefault();
            var maxPlateauLength = maxPlateau?.Length ?? 0;
            var plateauSummary = maxPlateauLength >= 2 && maxPlateau != null
                ? $"Plateau: P={maxPlateau.PStart}-{maxPlateau.PEnd}"
                : string.Empty;

            var isFullySaturated = maxPlateau != null
                && maxPlateau.Length == orderedPs.Count
                && orderedPs.Count > 0
                && tracesByP[orderedPs[0]].IsValid;

            var saturationReason = maxPlateauLength >= 2 && maxPlateau != null
                ? BuildSaturationReason(orderedPs.Where(p => p >= maxPlateau.PStart && p <= maxPlateau.PEnd)
                    .Select(p => tracesByP[p]))
                : string.Empty;

            var saturationTooltip = isFullySaturated && maxPlateau != null
                ? $"Ⓢ Saturated: projected output is identical for all shown P values (P={maxPlateau.PStart}-{maxPlateau.PEnd}) under {ProjectionMode}."
                : string.Empty;

            if (!string.IsNullOrWhiteSpace(saturationTooltip) && !string.IsNullOrWhiteSpace(saturationReason))
            {
                saturationTooltip = $"{saturationTooltip} {saturationReason}.";
            }

            var saturationAtDisplay = "-";
            var uniqueBeforeSaturation = 0;
            var preSaturationRangeCount = 0;
            if (_saturationMetricsCache.TryGetValue(anchorIndex, out var metrics))
            {
                saturationAtDisplay = metrics.SaturationAtDisplay;
                uniqueBeforeSaturation = metrics.UniqueBeforeSaturation;
                preSaturationRangeCount = metrics.PreSaturationRangeCount;
            }
            var saturationAtTooltip = "Computed from P=1-16. If P=16 differs from P=15, shown as P > 15.";
            var uniqueCountTooltip = "Distinct outputs up to saturation. If P > 15, count reflects P=1-16.";

            return new AcdlMultiDescriptorCacheEntry
            {
                ResultsByP = resultsByP,
                TracesByP = tracesByP,
                Plateaus = plateaus,
                FirstOccurrenceBySignature = firstOccurrenceBySignature,
                UniqueCount = uniqueCount,
                UniqueBeforeSaturation = uniqueBeforeSaturation,
                PreSaturationRangeCount = preSaturationRangeCount,
                MaxPlateauLength = maxPlateauLength,
                PlateauSummary = plateauSummary,
                IsFullySaturated = isFullySaturated,
                SaturationTooltip = saturationTooltip,
                SaturationReason = saturationReason,
                SaturationAtDisplay = saturationAtDisplay,
                SaturationAtTooltip = saturationAtTooltip,
                UniqueCountTooltip = uniqueCountTooltip
            };
        }

        private static List<AcdlPlateau> BuildPlateaus(
            IReadOnlyList<int> orderedPs,
            IReadOnlyDictionary<int, AcdlProjectionTrace> tracesByP,
            Dictionary<string, int> firstOccurrenceBySignature)
        {
            var plateaus = new List<AcdlPlateau>();
            if (orderedPs.Count == 0) return plateaus;

            var startP = orderedPs[0];
            var currentTrace = tracesByP[startP];
            var currentSignature = currentTrace.Signature;
            firstOccurrenceBySignature[currentSignature] = startP;
            var lastP = startP;

            for (int i = 1; i < orderedPs.Count; i++)
            {
                var p = orderedPs[i];
                var trace = tracesByP[p];
                var signature = trace.Signature;
                if (!firstOccurrenceBySignature.ContainsKey(signature))
                {
                    firstOccurrenceBySignature[signature] = p;
                }

                if (!string.Equals(signature, currentSignature, StringComparison.Ordinal))
                {
                    plateaus.Add(new AcdlPlateau(
                        startP,
                        lastP,
                        currentSignature,
                        currentTrace.ProjectedGaps,
                        currentTrace.ResultPitchList));
                    startP = p;
                    currentSignature = signature;
                    currentTrace = trace;
                }

                lastP = p;
            }

            plateaus.Add(new AcdlPlateau(
                startP,
                lastP,
                currentSignature,
                currentTrace.ProjectedGaps,
                currentTrace.ResultPitchList));
            return plateaus;
        }

        private static string BuildSaturationReason(IEnumerable<AcdlProjectionTrace> traces)
        {
            var list = traces.Where(t => t.IsValid).ToList();
            if (list.Count == 0) return string.Empty;

            var clampTotal = list.Sum(t => t.Details.NumClampsToMin);
            var trimCounts = new int[list[0].Details.TrimCountByIndex.Length];
            foreach (var trace in list)
            {
                var counts = trace.Details.TrimCountByIndex;
                for (int i = 0; i < counts.Length; i++)
                {
                    trimCounts[i] += counts[i];
                }
            }

            var trimmedIndices = trimCounts
                .Select((count, index) => new { count, index })
                .Where(entry => entry.count > 0)
                .OrderByDescending(entry => entry.count)
                .Select(entry => entry.index)
                .Take(3)
                .ToList();

            var parts = new List<string>();
            if (trimmedIndices.Count > 0)
            {
                parts.Add($"Trimmed indices {{{string.Join(",", trimmedIndices)}}}");
            }
            if (clampTotal > 0)
            {
                parts.Add($"min clamps {clampTotal}");
            }
            return string.Join("; ", parts);
        }

        private static string BuildSaturationAtDisplay(
            IReadOnlyList<int> saturationPs,
            IReadOnlyDictionary<int, AcdlProjectionTrace> tracesByP)
        {
            if (saturationPs.Count == 0) return "-";

            var ordered = saturationPs.OrderBy(p => p).ToArray();
            if (ordered.Any(p => !tracesByP.TryGetValue(p, out var trace) || !trace.IsValid))
            {
                return "-";
            }

            var lastChangeP = 0;
            for (int i = 1; i < ordered.Length; i++)
            {
                var current = tracesByP[ordered[i]];
                var previous = tracesByP[ordered[i - 1]];
                if (!string.Equals(current.Signature, previous.Signature, StringComparison.Ordinal))
                {
                    lastChangeP = ordered[i];
                }
            }

            var lastP = ordered[^1];
            var secondLastP = ordered.Length >= 2 ? ordered[^2] : 0;
            if (ordered.Length >= 2)
            {
                var lastSig = tracesByP[lastP].Signature;
                var prevSig = tracesByP[secondLastP].Signature;
                if (!string.Equals(lastSig, prevSig, StringComparison.Ordinal))
                {
                    return $"P > {secondLastP}";
                }
            }

            if (lastChangeP == 0)
            {
                return "P=1";
            }

            if (lastChangeP < lastP)
            {
                return $"P={lastChangeP + 1}";
            }

            return $"P > {lastP - 1}";
        }

        private void PrecomputeSaturationCache()
        {
            _saturationMetricsCache.Clear();
            if (!HasValidSource || _inputCint.Length == 0) return;

            var ordered = SaturationPValues.OrderBy(p => p).ToArray();
            for (int a = 0; a < _inputCint.Length; a++)
            {
                var tracesByP = new Dictionary<int, AcdlProjectionTrace>();
                foreach (var p in ordered)
                {
                    tracesByP[p] = BuildProjectionTrace(a, p);
                }
                var saturationAtDisplay = BuildSaturationAtDisplay(ordered, tracesByP);
                var preSaturationRangeCount = ordered.Length;
                var saturationAtP = ParseSaturationAtP(saturationAtDisplay);
                if (saturationAtP.HasValue && saturationAtP.Value >= ordered[0])
                {
                    preSaturationRangeCount = ordered.Count(p => p <= saturationAtP.Value);
                }

                var uniqueBeforeSaturation = tracesByP
                    .Where(kvp => kvp.Value.IsValid)
                    .Where(kvp => !saturationAtP.HasValue || kvp.Key <= saturationAtP.Value)
                    .Select(kvp => kvp.Value.Signature)
                    .Distinct()
                    .Count();

                _saturationMetricsCache[a] = new SaturationMetrics(
                    saturationAtDisplay,
                    uniqueBeforeSaturation,
                    preSaturationRangeCount);
            }
        }

        private static int? ParseSaturationAtP(string saturationAtDisplay)
        {
            if (string.IsNullOrWhiteSpace(saturationAtDisplay)) return null;
            if (saturationAtDisplay.StartsWith("P=", StringComparison.OrdinalIgnoreCase))
            {
                var value = saturationAtDisplay.Substring(2).Trim();
                if (int.TryParse(value, out var p)) return p;
            }
            return null;
        }

        private void UpdateMultiPValues(string input)
        {
            _multiPValues = ParsePValues(input);
            OnPropertyChanged(nameof(MultiPValues));
            OnPropertyChanged(nameof(HasMultiPValues));
            OnPropertyChanged(nameof(ShowMultiResults));
            OnPropertyChanged(nameof(ShowSingleResults));
            if (_multiPValues.Count == 0)
            {
                ClearMultiSelection();
            }
            Recompute();
        }

        private void UpdateMultiResultsSummary()
        {
            if (MultiResults.Count == 0)
            {
                MultiResultsSummary = string.Empty;
                return;
            }

            var fullySaturated = MultiResults.Count(r => r.IsFullySaturated);
            var avgUniqueBefore = MultiResults.Average(r => r.UniqueBeforeSaturation);
            MultiResultsSummary = $"Avg Unique: {avgUniqueBefore:0.##} | Fully Saturated: {fullySaturated}/{MultiResults.Count}";
        }

        private void UpdateSelectedMultiSummary()
        {
            if (!_selectedMultiAnchorIndex.HasValue)
            {
                SelectedMultiSummary = string.Empty;
                return;
            }

            var row = MultiResults.FirstOrDefault(r => r.AnchorGapIndex == _selectedMultiAnchorIndex.Value);
            if (row == null)
            {
                SelectedMultiSummary = string.Empty;
                return;
            }

            var baseSummary = $"Unique: {row.UniqueBeforeSaturation}";
            if (!string.IsNullOrWhiteSpace(row.SaturationReason))
            {
                SelectedMultiSummary = $"{baseSummary} | {row.SaturationReason}";
                return;
            }

            SelectedMultiSummary = baseSummary;
        }

        private static List<int> ParsePValues(string input)
        {
            var results = new List<int>();
            if (string.IsNullOrWhiteSpace(input))
            {
                return results;
            }

            var seen = new HashSet<int>();
            var parts = input.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
            foreach (var part in parts)
            {
                if (part.Contains('-', StringComparison.Ordinal))
                {
                    var rangeParts = part.Split('-', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
                    if (rangeParts.Length != 2) continue;
                    if (!int.TryParse(rangeParts[0], out var start)) continue;
                    if (!int.TryParse(rangeParts[1], out var end)) continue;
                    if (start < 1 || end < 1) continue;
                    if (start > end)
                    {
                        (start, end) = (end, start);
                    }
                    for (int p = start; p <= end; p++)
                    {
                        if (seen.Add(p))
                        {
                            results.Add(p);
                        }
                    }
                }
                else
                {
                    if (!int.TryParse(part, out var value)) continue;
                    if (value < 1) continue;
                    if (seen.Add(value))
                    {
                        results.Add(value);
                    }
                }
            }

            return results;
        }

        private void UpdateMultiSelectionPreview()
        {
            if (!TryGetSelectedMulti(out var anchorIndex, out var p))
            {
                if (SelectedResult == null)
                {
                    _workspacePreview = null;
                    OnPropertyChanged(nameof(WorkspacePreview));
                }
                return;
            }

            if (!TryBuildResult(anchorIndex, p, out var fixedGap, out var projectedCint, out var resultList))
            {
                _workspacePreview = null;
                OnPropertyChanged(nameof(WorkspacePreview));
                return;
            }

            var node = new AtomicNode
            {
                Modulus = _modulus,
                Mode = PcMode.Ordered,
                Ordered = resultList.ToArray(),
                Unordered = MusicUtils.NormalizeUnordered(resultList, _modulus),
                ValueType = AtomicValueType.PitchList,
                Label = "Preview"
            };

            var attributes = new List<WorkspacePreviewAttribute>
            {
                new WorkspacePreviewAttribute("Lens", "ACDL"),
                new WorkspacePreviewAttribute("AnchorGapIndex", anchorIndex.ToString()),
                new WorkspacePreviewAttribute("FixedGap", fixedGap.ToString()),
                new WorkspacePreviewAttribute("P", p.ToString()),
                new WorkspacePreviewAttribute("ProjectionMode", ProjectionMode.ToString()),
                new WorkspacePreviewAttribute("InputCINT", _inputCint.Length == 0 ? string.Empty : $"[{string.Join(' ', _inputCint)}]"),
                new WorkspacePreviewAttribute("ProjectedCINT", projectedCint.Length == 0 ? "-" : $"[{string.Join(' ', projectedCint)}]"),
                new WorkspacePreviewAttribute("Result", resultList.Length == 0 ? "-" : $"({string.Join(' ', resultList)})"),
                new WorkspacePreviewAttribute("Distinct", resultList.Length == 0 ? "-" : $"u={resultList.Distinct().Count()}/{resultList.Length}")
            };

            _workspacePreview = new WorkspacePreview(node, "line", attributes);
            OnPropertyChanged(nameof(WorkspacePreview));
        }

        private void UpdateWorkspacePreview(AcdlResultRow? row)
        {
            if (row == null || _sourceNode == null || !row.IsValid)
            {
                _workspacePreview = null;
                OnPropertyChanged(nameof(WorkspacePreview));
                return;
            }

            var pcs = row.ResultPitchList.ToArray();
            var node = new AtomicNode
            {
                Modulus = _modulus,
                Mode = PcMode.Ordered,
                Ordered = pcs,
                Unordered = MusicUtils.NormalizeUnordered(pcs, _modulus),
                ValueType = AtomicValueType.PitchList,
                Label = "Preview"
            };

            var attributes = new List<WorkspacePreviewAttribute>
            {
                new WorkspacePreviewAttribute("Lens", "ACDL"),
                new WorkspacePreviewAttribute("AnchorGapIndex", row.AnchorGapIndex.ToString()),
                new WorkspacePreviewAttribute("FixedGap", row.FixedGap.ToString()),
                new WorkspacePreviewAttribute("P", P.ToString()),
                new WorkspacePreviewAttribute("ProjectionMode", ProjectionMode.ToString()),
                new WorkspacePreviewAttribute("InputCINT", row.InputCintDisplay),
                new WorkspacePreviewAttribute("ProjectedCINT", row.ProjectedCintDisplay),
                new WorkspacePreviewAttribute("Result", row.ResultDisplay),
                new WorkspacePreviewAttribute("Distinct", row.DistinctDisplay)
            };

            _workspacePreview = new WorkspacePreview(node, "line", attributes);
            OnPropertyChanged(nameof(WorkspacePreview));
        }

        private void CommitSelected()
        {
            if (TryGetSelectedMulti(out var anchorIndex, out var p))
            {
                CommitMultiSelection(anchorIndex, p);
                return;
            }

            if (SelectedResult == null) return;
            CommitRow(SelectedResult);
        }

        private bool CanCommitSelected()
        {
            if (TryGetSelectedMulti(out var anchorIndex, out var p))
            {
                return TryBuildResult(anchorIndex, p, out _, out _, out _);
            }

            return SelectedResult?.IsValid == true;
        }

        private void CommitRow(AcdlResultRow? row)
        {
            if (row == null || _sourceNode == null || !row.IsValid) return;
            var current = _sourceNode;
            var currentPcs = current.Mode == PcMode.Ordered ? current.Ordered : current.Unordered;
            if (current.Mode == PcMode.Ordered && currentPcs.SequenceEqual(row.ResultPitchList))
            {
                return;
            }

            var resultPcs = row.ResultPitchList.ToArray();
            var node = new AtomicNode
            {
                NodeId = Guid.NewGuid(),
                Modulus = _modulus,
                Mode = PcMode.Ordered,
                Ordered = resultPcs,
                Unordered = MusicUtils.NormalizeUnordered(resultPcs, _modulus),
                ValueType = AtomicValueType.PitchList,
                Label = "ACDL",
                OpFromPrev = new OpDescriptor
                {
                    OpType = "ACDL",
                    OperationLabel = $"ACDL a={row.AnchorGapIndex}",
                    SourceLens = "ACDL",
                    SourceNodeId = current.NodeId,
                    OpParams = new Dictionary<string, object>
                    {
                        ["P"] = P,
                        ["ProjectionMode"] = ProjectionMode.ToString(),
                        ["AnchorGapIndex"] = row.AnchorGapIndex,
                        ["FixedGap"] = row.FixedGap,
                        ["Modulus"] = _modulus
                    }
                }
            };

            var nodeId = _store.GetOrAddNode(node);
            var prevState = _store.SelectedState;
            var nextState = new CompositeState
            {
                CompositeId = _store.SelectedComposite?.CompositeId ?? Guid.NewGuid(),
                PitchRef = nodeId,
                RhythmRef = prevState?.RhythmRef,
                RegisterRef = prevState?.RegisterRef,
                InstrumentRef = prevState?.InstrumentRef,
                VoicingRef = prevState?.VoicingRef,
                EventsRef = prevState?.EventsRef,
                ActivePreview = prevState?.ActivePreview ?? CompositePreviewTarget.Auto
            };

            var opParams = new Dictionary<string, object>
            {
                ["P"] = P,
                ["ProjectionMode"] = ProjectionMode.ToString(),
                ["AnchorGapIndex"] = row.AnchorGapIndex,
                ["FixedGap"] = row.FixedGap,
                ["Modulus"] = _modulus
            };
            _store.TransformState("ACDL", opParams, nextState);
        }

        private void CommitMultiSelection(int anchorIndex, int p)
        {
            if (_sourceNode == null || !TryBuildResult(anchorIndex, p, out var fixedGap, out _, out var resultList))
            {
                return;
            }

            var current = _sourceNode;
            var currentPcs = current.Mode == PcMode.Ordered ? current.Ordered : current.Unordered;
            if (current.Mode == PcMode.Ordered && currentPcs.SequenceEqual(resultList))
            {
                return;
            }

            var node = new AtomicNode
            {
                NodeId = Guid.NewGuid(),
                Modulus = _modulus,
                Mode = PcMode.Ordered,
                Ordered = resultList.ToArray(),
                Unordered = MusicUtils.NormalizeUnordered(resultList, _modulus),
                ValueType = AtomicValueType.PitchList,
                Label = "ACDL",
                OpFromPrev = new OpDescriptor
                {
                    OpType = "ACDL",
                    OperationLabel = $"ACDL a={anchorIndex}",
                    SourceLens = "ACDL",
                    SourceNodeId = current.NodeId,
                    OpParams = new Dictionary<string, object>
                    {
                        ["P"] = p,
                        ["ProjectionMode"] = ProjectionMode.ToString(),
                        ["AnchorGapIndex"] = anchorIndex,
                        ["FixedGap"] = fixedGap,
                        ["Modulus"] = _modulus
                    }
                }
            };

            var nodeId = _store.GetOrAddNode(node);
            var prevState = _store.SelectedState;
            var nextState = new CompositeState
            {
                CompositeId = _store.SelectedComposite?.CompositeId ?? Guid.NewGuid(),
                PitchRef = nodeId,
                RhythmRef = prevState?.RhythmRef,
                RegisterRef = prevState?.RegisterRef,
                InstrumentRef = prevState?.InstrumentRef,
                VoicingRef = prevState?.VoicingRef,
                EventsRef = prevState?.EventsRef,
                ActivePreview = prevState?.ActivePreview ?? CompositePreviewTarget.Auto
            };

            var opParams = new Dictionary<string, object>
            {
                ["P"] = p,
                ["ProjectionMode"] = ProjectionMode.ToString(),
                ["AnchorGapIndex"] = anchorIndex,
                ["FixedGap"] = fixedGap,
                ["Modulus"] = _modulus
            };
            _store.TransformState("ACDL", opParams, nextState);
        }

        private void ClearMultiSelection()
        {
            _selectedMultiAnchorIndex = null;
            _selectedMultiP = null;
            OnPropertyChanged(nameof(SelectedMultiAnchorIndex));
            OnPropertyChanged(nameof(SelectedMultiP));
            UpdateMultiSelectionPreview();
            UpdateSelectedMultiSummary();
            CommitSelectedCommand.NotifyCanExecuteChanged();
        }

        private bool TryGetSelectedMulti(out int anchorIndex, out int p)
        {
            anchorIndex = 0;
            p = 0;
            if (!_selectedMultiAnchorIndex.HasValue || !_selectedMultiP.HasValue)
            {
                return false;
            }

            anchorIndex = _selectedMultiAnchorIndex.Value;
            p = _selectedMultiP.Value;
            return p > 0 && anchorIndex >= 0;
        }

        private bool TryBuildResult(int anchorIndex, int p, out int fixedGap, out int[] projectedCint, out int[] resultList)
        {
            fixedGap = 0;
            projectedCint = Array.Empty<int>();
            resultList = Array.Empty<int>();
            if (!HasValidSource || _inputCint.Length == 0)
            {
                return false;
            }

            var ok = AcdlMath.TryProjectGaps(
                _inputCint,
                _modulus,
                anchorIndex,
                p,
                ProjectionMode,
                out fixedGap,
                out projectedCint,
                out _,
                out _,
                out _);

            if (!ok)
            {
                return false;
            }

            resultList = BuildResultList(anchorIndex, projectedCint);
            return true;
        }

        private void DedupeSource()
        {
            if (_sourceNode == null || !HasPitchSource || !IsOrderedSource) return;
            var unique = _sourceOrdered
                .Where((x, idx) => _sourceOrdered.Take(idx).All(y => y != x))
                .ToArray();
            if (unique.Length == _sourceOrdered.Length) return;

            var node = new AtomicNode
            {
                NodeId = Guid.NewGuid(),
                Modulus = _modulus,
                Mode = PcMode.Ordered,
                Ordered = unique,
                Unordered = MusicUtils.NormalizeUnordered(unique, _modulus),
                ValueType = AtomicValueType.PitchList,
                Label = "ACDL Unique",
                OpFromPrev = new OpDescriptor
                {
                    OpType = "ACDL - Unique PCs",
                    OperationLabel = "ACDL - Unique PCs",
                    SourceLens = "ACDL",
                    SourceNodeId = _sourceNode.NodeId,
                    OpParams = new Dictionary<string, object>
                    {
                        ["Modulus"] = _modulus,
                        ["Original"] = _sourceOrdered.ToArray(),
                        ["Unique"] = unique.ToArray()
                    }
                }
            };

            var nodeId = _store.GetOrAddNode(node);
            var prevState = _store.SelectedState;
            var nextState = new CompositeState
            {
                CompositeId = _store.SelectedComposite?.CompositeId ?? Guid.NewGuid(),
                PitchRef = nodeId,
                RhythmRef = prevState?.RhythmRef,
                RegisterRef = prevState?.RegisterRef,
                InstrumentRef = prevState?.InstrumentRef,
                VoicingRef = prevState?.VoicingRef,
                EventsRef = prevState?.EventsRef,
                ActivePreview = prevState?.ActivePreview ?? CompositePreviewTarget.Auto
            };

            var opParams = new Dictionary<string, object>
            {
                ["Modulus"] = _modulus,
                ["Original"] = _sourceOrdered.ToArray(),
                ["Unique"] = unique.ToArray()
            };
            _store.TransformState("ACDL - Unique PCs", opParams, nextState);
        }

        private void CreateOrderedFromUnordered()
        {
            if (_sourceNode == null || !HasPitchSource || IsOrderedSource) return;
            var source = _sourceNode.Unordered?.ToArray() ?? Array.Empty<int>();
            if (source.Length == 0) return;

            var node = new AtomicNode
            {
                NodeId = Guid.NewGuid(),
                Modulus = _modulus,
                Mode = PcMode.Ordered,
                Ordered = source.ToArray(),
                Unordered = MusicUtils.NormalizeUnordered(source, _modulus),
                ValueType = AtomicValueType.PitchList,
                Label = "ACDL Ordered",
                OpFromPrev = new OpDescriptor
                {
                    OpType = "ACDL - Ordered from Unordered",
                    OperationLabel = "ACDL - Ordered from Unordered",
                    SourceLens = "ACDL",
                    SourceNodeId = _sourceNode.NodeId,
                    OpParams = new Dictionary<string, object>
                    {
                        ["Modulus"] = _modulus,
                        ["Ordered"] = source.ToArray()
                    }
                }
            };

            var nodeId = _store.GetOrAddNode(node);
            var prevState = _store.SelectedState;
            var nextState = new CompositeState
            {
                CompositeId = _store.SelectedComposite?.CompositeId ?? Guid.NewGuid(),
                PitchRef = nodeId,
                RhythmRef = prevState?.RhythmRef,
                RegisterRef = prevState?.RegisterRef,
                InstrumentRef = prevState?.InstrumentRef,
                VoicingRef = prevState?.VoicingRef,
                EventsRef = prevState?.EventsRef,
                ActivePreview = prevState?.ActivePreview ?? CompositePreviewTarget.Auto
            };

            var opParams = new Dictionary<string, object>
            {
                ["Modulus"] = _modulus,
                ["Ordered"] = source.ToArray()
            };
            _store.TransformState("ACDL - Ordered from Unordered", opParams, nextState);
        }

        private static bool IsAscending(int[] values)
        {
            if (values == null || values.Length < 2) return true;
            for (int i = 1; i < values.Length; i++)
            {
                if (values[i] <= values[i - 1]) return false;
            }
            return true;
        }
    }
}
