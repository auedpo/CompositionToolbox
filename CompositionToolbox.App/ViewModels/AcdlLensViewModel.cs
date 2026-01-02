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
        public AcdlMultiResultRow(int anchorGapIndex, Dictionary<int, string> resultsByP)
        {
            AnchorGapIndex = anchorGapIndex;
            ResultsByP = resultsByP ?? new Dictionary<int, string>();
        }

        public int AnchorGapIndex { get; }
        public IReadOnlyDictionary<int, string> ResultsByP { get; }

        public string this[int p] => ResultsByP.TryGetValue(p, out var value) ? value : "-";
    }

    public sealed class AcdlLensViewModel : ObservableObject, ILensPreviewSource, ILensActivation
    {
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
        private string _multiPInput = string.Empty;
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
            _sourceNode = node;
            if (node == null || node.ValueType != AtomicValueType.PitchList)
            {
                ClearSource();
                return;
            }

            HasPitchSource = true;
            IsOrderedSource = node.Mode == PcMode.Ordered;
            CreateOrderedFromUnorderedCommand.NotifyCanExecuteChanged();
            _modulus = node.Modulus;
            _sourceOrdered = node.Mode == PcMode.Ordered ? node.Ordered : node.Unordered;
            SourceDisplay = _sourceOrdered.Length == 0 ? string.Empty : $"({string.Join(' ', _sourceOrdered)})";

            if (!IsOrderedSource)
            {
                StatusText = "ACDL requires an ordered PitchList.";
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
            StatusText = "Select an ordered PitchList with unique pcs.";
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
        }

        private void ClearMultiResults()
        {
            MultiResults.Clear();
        }

        private void Recompute()
        {
            if (!_isActive) return;
            if (!HasValidSource || _inputCint.Length == 0)
            {
                ClearResults();
                return;
            }

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
            var k = _inputCint.Length;
            for (int a = 0; a < k; a++)
            {
                var resultMap = new Dictionary<int, string>();
                foreach (var p in _multiPValues)
                {
                    resultMap[p] = BuildResultDisplay(a, p);
                }
                MultiResults.Add(new AcdlMultiResultRow(a, resultMap));
            }
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

        private string BuildResultDisplay(int anchorIndex, int p)
        {
            var ok = AcdlMath.TryProjectGaps(
                _inputCint,
                _modulus,
                anchorIndex,
                p,
                ProjectionMode,
                out _,
                out var projectedCint,
                out _,
                out _,
                out _);

            if (!ok)
            {
                return "-";
            }

            var resultList = BuildResultList(anchorIndex, projectedCint);
            return resultList.Length == 0 ? "-" : $"({string.Join(' ', resultList)})";
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
    }
}
