using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using CompositionToolbox.App.Models;
using CompositionToolbox.App.Services;
using CompositionToolbox.App.Stores;
using System;
using System.Collections.Generic;
using System.Collections.ObjectModel;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;

namespace CompositionToolbox.App.ViewModels
{
    public enum IvDisplayForm
    {
        NF,
        PF
    }

    public enum IvExplorerActionType
    {
        Decrement,
        Increment
    }

    public class IVExplorerViewModel : ObservableObject, ILensPreviewSource, ILensActivation
    {
        private static readonly IntervalVectorIndexService _indexService = new();
        private readonly CompositeStore _store;
        private IntervalVectorIndex? _index;
        private CancellationTokenSource? _indexCts;
        private AtomicNode? _sourceNode;
        private int _modulus;
        private int[] _baseSet = Array.Empty<int>();
        private int[] _baseIv = Array.Empty<int>();
        private string _baseSetDisplay = "[]";
        private string _baseIvDisplay = "[]";
        private bool _hasValidSource;
        private bool _isIndexBuilding;
        private string _indexStatusText = "Index not built.";
        private IvEquivalenceMode _equivalenceMode = IvEquivalenceMode.T;
        private IvDisplayForm _displayForm = IvDisplayForm.NF;
        private IVExplorerResultRow? _selectedResult;
        private WorkspacePreview? _workspacePreview;
        private bool _isActive;
        private bool _pendingUpdate;

        private readonly Dictionary<IvActionKey, int> _actionCounts = new();
        private readonly Dictionary<IvActionKey, List<IVExplorerResultRow>> _actionResults = new();

        public IVExplorerViewModel(CompositeStore store)
        {
            _store = store;
            CommitSelectedCommand = new RelayCommand(CommitSelected, () => SelectedResult != null && HasValidSource);
            CopyCommand = new RelayCommand<IVExplorerResultRow>(CopyRow, row => row != null);
            PinCommand = new RelayCommand<IVExplorerResultRow>(PinRow, row => row != null);
            UnpinCommand = new RelayCommand<IVExplorerResultRow>(UnpinRow, row => row != null);

            Results.CollectionChanged += (_, _) =>
            {
                OnPropertyChanged(nameof(HasResults));
                OnPropertyChanged(nameof(ResultsHeader));
            };
            PinnedResults.CollectionChanged += (_, _) =>
            {
                OnPropertyChanged(nameof(HasPinned));
            };

            _store.PropertyChanged += (_, e) =>
            {
                if (e.PropertyName == nameof(CompositeStore.SelectedState))
                {
                    UpdateFromSelectedState();
                }
            };
            _store.Nodes.CollectionChanged += (_, _) => UpdateFromSelectedState();

            UpdateFromSelectedState();
        }

        public ObservableCollection<IVExplorerIcRow> IcRows { get; } = new();
        public ObservableCollection<IVExplorerResultRow> Results { get; } = new();
        public ObservableCollection<IVExplorerResultRow> PinnedResults { get; } = new();

        public IRelayCommand CommitSelectedCommand { get; }
        public IRelayCommand<IVExplorerResultRow> CopyCommand { get; }
        public IRelayCommand<IVExplorerResultRow> PinCommand { get; }
        public IRelayCommand<IVExplorerResultRow> UnpinCommand { get; }

        public bool HasValidSource
        {
            get => _hasValidSource;
            private set
            {
                if (SetProperty(ref _hasValidSource, value))
                {
                    CommitSelectedCommand.NotifyCanExecuteChanged();
                }
            }
        }

        public int Modulus => _modulus;
        public int Cardinality => _baseSet.Length;

        public string BaseSetDisplay
        {
            get => _baseSetDisplay;
            private set => SetProperty(ref _baseSetDisplay, value);
        }

        public string BaseIvDisplay
        {
            get => _baseIvDisplay;
            private set => SetProperty(ref _baseIvDisplay, value);
        }

        public IvEquivalenceMode EquivalenceMode
        {
            get => _equivalenceMode;
            set
            {
                if (SetProperty(ref _equivalenceMode, value))
                {
                    if (_equivalenceMode == IvEquivalenceMode.T && DisplayForm == IvDisplayForm.PF)
                    {
                        DisplayForm = IvDisplayForm.NF;
                    }
                    OnPropertyChanged(nameof(IsPrimeFormEnabled));
                    RestartIndexBuild();
                }
            }
        }

        public IvDisplayForm DisplayForm
        {
            get => _displayForm;
            set
            {
                if (SetProperty(ref _displayForm, value))
                {
                    UpdateDisplayForm();
                }
            }
        }

        public bool IsPrimeFormEnabled => EquivalenceMode == IvEquivalenceMode.TI;

        public bool IsIndexBuilding
        {
            get => _isIndexBuilding;
            private set => SetProperty(ref _isIndexBuilding, value);
        }

        public string IndexStatusText
        {
            get => _indexStatusText;
            private set => SetProperty(ref _indexStatusText, value);
        }

        public bool HasResults => Results.Count > 0;
        public bool HasPinned => PinnedResults.Count > 0;

        public string ResultsHeader => $"Results ({Results.Count})";

        public IVExplorerResultRow? SelectedResult
        {
            get => _selectedResult;
            set
            {
                if (SetProperty(ref _selectedResult, value))
                {
                    UpdateWorkspacePreview(value);
                    CommitSelectedCommand.NotifyCanExecuteChanged();
                }
            }
        }

        public WorkspacePreview? WorkspacePreview => _workspacePreview;

        public void Activate()
        {
            if (_isActive) return;
            _isActive = true;
            if (_pendingUpdate)
            {
                UpdateFromSelectedState();
            }
        }

        public void Deactivate()
        {
            _isActive = false;
            CancelIndexBuild();
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
                ClearSourceState();
                return;
            }

            var pcs = node.Mode == PcMode.Ordered ? node.Ordered : node.Unordered;
            var set = MusicUtils.NormalizeUnordered(pcs, node.Modulus);
            if (set.Length < 2)
            {
                ClearSourceState();
                return;
            }

            _modulus = node.Modulus;
            _baseSet = set;
            _baseIv = IntervalVectorIndexService.ComputeIntervalVector(set, _modulus);
            BaseSetDisplay = FormatUnordered(set);
            BaseIvDisplay = FormatIv(_baseIv);
            HasValidSource = true;
            OnPropertyChanged(nameof(Modulus));
            OnPropertyChanged(nameof(Cardinality));
            BuildIcRows();
            ClearResults();
            RestartIndexBuild();
        }

        private void ClearSourceState()
        {
            _modulus = 0;
            _baseSet = Array.Empty<int>();
            _baseIv = Array.Empty<int>();
            BaseSetDisplay = "[]";
            BaseIvDisplay = "[]";
            HasValidSource = false;
            IcRows.Clear();
            ClearResults();
            CancelIndexBuild();
            _index = null;
            IndexStatusText = "Index not built.";
            OnPropertyChanged(nameof(Modulus));
            OnPropertyChanged(nameof(Cardinality));
        }

        private void BuildIcRows()
        {
            IcRows.Clear();
            var icCount = _modulus / 2;
            for (int i = 1; i <= icCount; i++)
            {
                var row = new IVExplorerIcRow(i, OnActionRequested);
                row.BaseValue = _baseIv.Length >= i ? _baseIv[i - 1] : 0;
                IcRows.Add(row);
            }
        }

        private void RestartIndexBuild()
        {
            if (!_isActive)
            {
                _pendingUpdate = true;
                return;
            }

            CancelIndexBuild();
            _index = null;
            _actionCounts.Clear();
            _actionResults.Clear();

            if (!HasValidSource)
            {
                UpdateActionCounts();
                return;
            }

            IsIndexBuilding = true;
            IndexStatusText = "Building index...";
            var cts = new CancellationTokenSource();
            _indexCts = cts;
            var progress = new Progress<IndexBuildProgress>(p =>
            {
                IndexStatusText = $"Building index {p.Percent:0}%";
            });

            _ = _indexService.EnsureIndexAsync(_modulus, _baseSet.Length, EquivalenceMode, progress, cts.Token)
                .ContinueWith(t =>
                {
                    if (!ReferenceEquals(cts, _indexCts)) return;
                    if (cts.IsCancellationRequested || t.IsCanceled || t.Exception?.GetBaseException() is OperationCanceledException)
                    {
                        IsIndexBuilding = false;
                        IndexStatusText = "Index build canceled.";
                        UpdateActionCounts();
                        return;
                    }
                    if (t.IsFaulted)
                    {
                        IndexStatusText = $"Index build failed: {t.Exception?.GetBaseException().Message}";
                        IsIndexBuilding = false;
                        UpdateActionCounts();
                        return;
                    }

                    _index = t.Result;
                    IsIndexBuilding = false;
                    IndexStatusText = "Index ready.";
                    UpdateActionCounts();
                }, CancellationToken.None, TaskContinuationOptions.None, TaskScheduler.FromCurrentSynchronizationContext());
        }

        private void CancelIndexBuild()
        {
            if (_indexCts != null)
            {
                _indexCts.Cancel();
                _indexCts = null;
            }
        }

        private void UpdateActionCounts()
        {
            foreach (var row in IcRows)
            {
                row.BaseValue = _baseIv.Length >= row.IcIndex ? _baseIv[row.IcIndex - 1] : 0;
                if (_index == null || IsIndexBuilding)
                {
                    row.SetCounts(0, 0, false, false);
                    continue;
                }

                var decCount = GetActionCount(row.IcIndex, IvExplorerActionType.Decrement);
                var incCount = GetActionCount(row.IcIndex, IvExplorerActionType.Increment);
                row.SetCounts(decCount, incCount, decCount > 0, incCount > 0);
            }
        }

        private int GetActionCount(int icIndex, IvExplorerActionType type)
        {
            var key = new IvActionKey(icIndex, type);
            if (_actionCounts.TryGetValue(key, out var count))
            {
                return count;
            }

            var index = _index;
            if (index == null)
            {
                return 0;
            }

            var repKeys = new HashSet<string>();
            foreach (var candidate in EnumerateCandidates(icIndex, type))
            {
                var ivKey = string.Join(",", candidate.TargetIv);
                if (!index.Buckets.TryGetValue(ivKey, out var reps)) continue;
                foreach (var rep in reps)
                {
                    repKeys.Add(rep.Key);
                }
            }

            count = repKeys.Count;
            _actionCounts[key] = count;
            return count;
        }

        private void OnActionRequested(int icIndex, IvExplorerActionType type)
        {
            if (_index == null || IsIndexBuilding) return;
            var key = new IvActionKey(icIndex, type);
            if (!_actionResults.TryGetValue(key, out var cached))
            {
                cached = BuildActionResults(icIndex, type);
                _actionResults[key] = cached;
            }

            Results.Clear();
            foreach (var row in cached)
            {
                row.UpdateDisplay(DisplayForm);
                Results.Add(row.Clone());
            }

            SelectedResult = Results.FirstOrDefault();
            OnPropertyChanged(nameof(ResultsHeader));
        }

        private List<IVExplorerResultRow> BuildActionResults(int icIndex, IvExplorerActionType type)
        {
            if (_index == null)
            {
                return new List<IVExplorerResultRow>();
            }
            var index = _index;
            var map = new Dictionary<string, IVExplorerResultRow>();
            foreach (var candidate in EnumerateCandidates(icIndex, type))
            {
                var ivKey = string.Join(",", candidate.TargetIv);
                if (!index.Buckets.TryGetValue(ivKey, out var reps)) continue;

                foreach (var rep in reps)
                {
                    if (map.ContainsKey(rep.Key)) continue;
                    var row = new IVExplorerResultRow(rep, DisplayForm, candidate.FromIc, candidate.ToIc, type);
                    map[rep.Key] = row;
                }
            }

            return map.Values
                .OrderBy(r => r.DisplaySet)
                .ToList();
        }

        private IEnumerable<IvMoveCandidate> EnumerateCandidates(int icIndex, IvExplorerActionType type)
        {
            if (_baseIv.Length == 0) yield break;
            var i = icIndex - 1;
            if (i < 0 || i >= _baseIv.Length) yield break;
            if (type == IvExplorerActionType.Decrement)
            {
                if (_baseIv[i] <= 0) yield break;
                for (int j = 0; j < _baseIv.Length; j++)
                {
                    if (j == i) continue;
                    var target = _baseIv.ToArray();
                    target[i]--;
                    target[j]++;
                    yield return new IvMoveCandidate(icIndex, j + 1, target);
                }
            }
            else
            {
                for (int j = 0; j < _baseIv.Length; j++)
                {
                    if (j == i || _baseIv[j] <= 0) continue;
                    var target = _baseIv.ToArray();
                    target[i]++;
                    target[j]--;
                    yield return new IvMoveCandidate(j + 1, icIndex, target);
                }
            }
        }

        private void UpdateDisplayForm()
        {
            foreach (var row in Results)
            {
                row.UpdateDisplay(DisplayForm);
            }
            foreach (var row in PinnedResults)
            {
                row.UpdateDisplay(DisplayForm);
            }
        }

        private void ClearResults()
        {
            Results.Clear();
            SelectedResult = null;
            _workspacePreview = null;
            OnPropertyChanged(nameof(WorkspacePreview));
        }

        private void UpdateWorkspacePreview(IVExplorerResultRow? row)
        {
            if (row == null || _sourceNode == null)
            {
                _workspacePreview = null;
                OnPropertyChanged(nameof(WorkspacePreview));
                return;
            }

            var pcs = row.Pcs.ToArray();
            var node = new AtomicNode
            {
                Modulus = _modulus,
                Mode = PcMode.Unordered,
                Ordered = pcs,
                Unordered = pcs,
                ValueType = AtomicValueType.PitchList,
                Label = "Preview"
            };

            var attrs = new List<WorkspacePreviewAttribute>
            {
                new WorkspacePreviewAttribute("Lens", "IV Explorer"),
                new WorkspacePreviewAttribute("Move", $"IC{row.FromIC} -> IC{row.ToIC}"),
                new WorkspacePreviewAttribute("Set", FormatUnordered(pcs)),
                new WorkspacePreviewAttribute("IV", FormatIv(row.IntervalVector))
            };

            _workspacePreview = new WorkspacePreview(node, "chord", attrs);
            OnPropertyChanged(nameof(WorkspacePreview));
        }

        private void CommitSelected()
        {
            if (_sourceNode == null || SelectedResult == null || !HasValidSource) return;

            var pcs = SelectedResult.Pcs.ToArray();
            if (_sourceNode.Mode == PcMode.Unordered && _sourceNode.Unordered.SequenceEqual(pcs))
            {
                return;
            }

            var deltaIntent = SelectedResult.ActionType == IvExplorerActionType.Decrement
                ? $"IC{SelectedResult.FromIC}-1"
                : $"IC{SelectedResult.ToIC}+1";
            var opParams = new Dictionary<string, object>
            {
                ["n"] = _modulus,
                ["k"] = _baseSet.Length,
                ["fromIC"] = SelectedResult.FromIC,
                ["toIC"] = SelectedResult.ToIC,
                ["baseIV"] = _baseIv.ToArray(),
                ["targetIV"] = SelectedResult.IntervalVector.ToArray(),
                ["eqMode"] = EquivalenceMode.ToString(),
                ["displayMode"] = DisplayForm.ToString(),
                ["representativeKey"] = SelectedResult.RepresentativeKey,
                ["deltaIntent"] = deltaIntent
            };

            var node = new AtomicNode
            {
                NodeId = Guid.NewGuid(),
                Modulus = _modulus,
                Mode = PcMode.Unordered,
                Ordered = pcs,
                Unordered = pcs,
                ValueType = AtomicValueType.PitchList,
                OpFromPrev = new OpDescriptor
                {
                    OpType = "IVMove",
                    OperationLabel = $"IV Move IC{SelectedResult.FromIC}->IC{SelectedResult.ToIC}",
                    SourceLens = "IV Explorer",
                    SourceNodeId = _sourceNode.NodeId,
                    OpParams = new Dictionary<string, object>(opParams)
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
                ActivePreview = prevState?.ActivePreview ?? CompositePreviewTarget.Auto,
                Label = prevState?.Label
            };

            _store.TransformState("IV Move", opParams, nextState);
        }

        private void CopyRow(IVExplorerResultRow? row)
        {
            if (row == null) return;
            System.Windows.Clipboard.SetText(row.DisplaySet);
        }

        private void PinRow(IVExplorerResultRow? row)
        {
            if (row == null) return;
            if (PinnedResults.Any(r => r.RepresentativeKey == row.RepresentativeKey)) return;
            var clone = row.Clone();
            clone.UpdateDisplay(DisplayForm);
            PinnedResults.Add(clone);
        }

        private void UnpinRow(IVExplorerResultRow? row)
        {
            if (row == null) return;
            var existing = PinnedResults.FirstOrDefault(r => r.RepresentativeKey == row.RepresentativeKey);
            if (existing != null)
            {
                PinnedResults.Remove(existing);
            }
        }

        private static string FormatUnordered(int[] pcs)
        {
            return $"[{string.Join(' ', pcs)}]";
        }

        private static string FormatIv(int[] iv)
        {
            return $"<{string.Join(',', iv)}>";
        }

        private readonly record struct IvActionKey(int IcIndex, IvExplorerActionType ActionType);
        private readonly record struct IvMoveCandidate(int FromIc, int ToIc, int[] TargetIv);
    }

    public sealed class IVExplorerIcRow : ObservableObject
    {
        private readonly Action<int, IvExplorerActionType> _actionCallback;
        private int _baseValue;
        private int _decrementCount;
        private int _incrementCount;
        private bool _canDecrement;
        private bool _canIncrement;

        public IVExplorerIcRow(int icIndex, Action<int, IvExplorerActionType> actionCallback)
        {
            IcIndex = icIndex;
            _actionCallback = actionCallback;
            DecrementCommand = new RelayCommand(() => _actionCallback(IcIndex, IvExplorerActionType.Decrement), () => CanDecrement);
            IncrementCommand = new RelayCommand(() => _actionCallback(IcIndex, IvExplorerActionType.Increment), () => CanIncrement);
        }

        public int IcIndex { get; }

        public int BaseValue
        {
            get => _baseValue;
            set => SetProperty(ref _baseValue, value);
        }

        public int DecrementCount
        {
            get => _decrementCount;
            private set => SetProperty(ref _decrementCount, value);
        }

        public int IncrementCount
        {
            get => _incrementCount;
            private set => SetProperty(ref _incrementCount, value);
        }

        public bool CanDecrement
        {
            get => _canDecrement;
            private set
            {
                if (SetProperty(ref _canDecrement, value))
                {
                    DecrementCommand.NotifyCanExecuteChanged();
                }
            }
        }

        public bool CanIncrement
        {
            get => _canIncrement;
            private set
            {
                if (SetProperty(ref _canIncrement, value))
                {
                    IncrementCommand.NotifyCanExecuteChanged();
                }
            }
        }

        public string DecrementCountDisplay => $"({DecrementCount})";
        public string IncrementCountDisplay => $"({IncrementCount})";

        public IRelayCommand DecrementCommand { get; }
        public IRelayCommand IncrementCommand { get; }

        public void SetCounts(int decrement, int increment, bool canDecrement, bool canIncrement)
        {
            DecrementCount = decrement;
            IncrementCount = increment;
            CanDecrement = canDecrement;
            CanIncrement = canIncrement;
            OnPropertyChanged(nameof(DecrementCountDisplay));
            OnPropertyChanged(nameof(IncrementCountDisplay));
        }
    }

    public sealed class IVExplorerResultRow : ObservableObject
    {
        private string _displaySet;

        public IVExplorerResultRow(RepresentativeSet rep, IvDisplayForm displayForm, int fromIc, int toIc, IvExplorerActionType actionType)
        {
            RepresentativeKey = rep.Key;
            Pcs = rep.Pcs.ToArray();
            NormalForm = rep.NormalForm.ToArray();
            PrimeForm = rep.PrimeForm.ToArray();
            IntervalVector = rep.IntervalVector.ToArray();
            FromIC = fromIc;
            ToIC = toIc;
            ActionType = actionType;
            _displaySet = FormatDisplay(displayForm);
        }

        public string RepresentativeKey { get; }
        public int[] Pcs { get; }
        public int[] NormalForm { get; }
        public int[] PrimeForm { get; }
        public int[] IntervalVector { get; }
        public int FromIC { get; }
        public int ToIC { get; }
        public IvExplorerActionType ActionType { get; }

        public string DisplaySet
        {
            get => _displaySet;
            private set => SetProperty(ref _displaySet, value);
        }

        public string IntervalVectorDisplay => $"<{string.Join(',', IntervalVector)}>";

        public void UpdateDisplay(IvDisplayForm displayForm)
        {
            DisplaySet = FormatDisplay(displayForm);
        }

        public IVExplorerResultRow Clone()
        {
            return new IVExplorerResultRow(
                new RepresentativeSet
                {
                    Key = RepresentativeKey,
                    Pcs = Pcs.ToArray(),
                    NormalForm = NormalForm.ToArray(),
                    PrimeForm = PrimeForm.ToArray(),
                    IntervalVector = IntervalVector.ToArray()
                },
                IvDisplayForm.NF,
                FromIC,
                ToIC,
                ActionType)
            {
                _displaySet = _displaySet
            };
        }

        private string FormatDisplay(IvDisplayForm form)
        {
            if (form == IvDisplayForm.PF && PrimeForm.Length > 0)
            {
                return $"[{string.Join(' ', PrimeForm)}]";
            }
            return $"[{string.Join(' ', NormalForm)}]";
        }
    }
}
