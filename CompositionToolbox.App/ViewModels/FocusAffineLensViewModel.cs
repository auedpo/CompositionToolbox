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
    public enum FocusMode
    {
        All,
        Single
    }

    public sealed class FocusAffineResultRow
    {
        public FocusAffineResultRow(int focus, PCSet resultSet, int[] intervalVector, int baseCardinality)
        {
            Focus = focus;
            ResultSet = resultSet;
            IntervalVector = intervalVector;
            Cardinality = resultSet.Cardinality;
            CardinalityChanged = Cardinality != baseCardinality;
            BaseCardinality = baseCardinality;
        }

        public int Focus { get; }
        public PCSet ResultSet { get; }
        public int[] IntervalVector { get; }
        public int Cardinality { get; }
        public bool CardinalityChanged { get; }
        public int BaseCardinality { get; }
        public string ResultDisplay => ResultSet.ToBracketString();
        public string IntervalVectorDisplay => $"<{string.Join(',', IntervalVector)}>";
        public string CardinalityChangeDisplay
            => $"Δk {Cardinality - BaseCardinality:+#;-#;0} -> {Cardinality}";
    }

    public sealed class FocusAffineLensViewModel : ObservableObject, ILensPreviewSource, ILensActivation
    {
        private readonly CompositeStore _store;
        private AtomicNode? _sourceNode;
        private int[] _baseSet = Array.Empty<int>();
        private string _multiplierInput = "5";
        private int _multiplierA = 5;
        private FocusMode _focusMode = FocusMode.All;
        private int? _selectedFocus;
        private bool _hasValidSource;
        private bool _isActive;
        private FocusAffineResultRow? _selectedResult;
        private WorkspacePreview? _workspacePreview;
        private string _summaryText = string.Empty;
        private readonly Dictionary<FocusAffineCacheKey, List<FocusAffineResultRow>> _cache = new();

        public FocusAffineLensViewModel(CompositeStore store)
        {
            _store = store;
            FocusCandidates = new ObservableCollection<int>();
            Results = new ObservableCollection<FocusAffineResultRow>();
            CommitSelectedCommand = new RelayCommand(CommitSelected, () => SelectedResult != null);
            _store.PropertyChanged += (_, e) =>
            {
                if (e.PropertyName == nameof(CompositeStore.SelectedState))
                {
                    UpdateFromSelectedState();
                }
            };
            _store.Nodes.CollectionChanged += (_, _) => UpdateFromSelectedState();
        }

        public ObservableCollection<int> FocusCandidates { get; }
        public ObservableCollection<FocusAffineResultRow> Results { get; }

        public string MultiplierInput
        {
            get => _multiplierInput;
            set
            {
                if (SetProperty(ref _multiplierInput, value))
                {
                    if (int.TryParse(value, out var parsed))
                    {
                        MultiplierA = parsed;
                    }
                    else
                    {
                        Recompute();
                    }
                }
            }
        }

        public int MultiplierA
        {
            get => _multiplierA;
            private set
            {
                if (SetProperty(ref _multiplierA, value))
                {
                    Recompute();
                }
            }
        }

        public FocusMode FocusMode
        {
            get => _focusMode;
            set
            {
                if (SetProperty(ref _focusMode, value))
                {
                    SyncFocusCandidates();
                    Recompute();
                }
            }
        }

        public int? SelectedFocus
        {
            get => _selectedFocus;
            set
            {
                if (SetProperty(ref _selectedFocus, value))
                {
                    Recompute();
                }
            }
        }

        public bool HasValidSource
        {
            get => _hasValidSource;
            private set => SetProperty(ref _hasValidSource, value);
        }

        public string SummaryText
        {
            get => _summaryText;
            private set => SetProperty(ref _summaryText, value);
        }

        public FocusAffineResultRow? SelectedResult
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

        public IRelayCommand CommitSelectedCommand { get; }

        public void Activate()
        {
            if (_isActive) return;
            _isActive = true;
            UpdateFromSelectedState();
        }

        public void Deactivate()
        {
            _isActive = false;
        }

        private void UpdateFromSelectedState()
        {
            if (!_isActive) return;

            var state = _store.SelectedState;
            AtomicNode? node = null;
            if (state?.PitchRef != null)
            {
                node = _store.Nodes.FirstOrDefault(n => n.NodeId == state.PitchRef.Value);
            }
            SetSourceNode(node);
        }

        private void SetSourceNode(AtomicNode? node)
        {
            _sourceNode = node;
            if (node == null || node.ValueType != AtomicValueType.PitchList)
            {
                ClearSource();
                return;
            }

            var pcs = node.Mode == PcMode.Ordered ? node.Ordered : node.Unordered;
            _baseSet = FocusAffineMath.ComputeDistinctSet(pcs, node.Modulus);
            if (_baseSet.Length == 0)
            {
                ClearSource();
                return;
            }

            HasValidSource = true;
            SyncFocusCandidates();
            Recompute();
        }

        private void ClearSource()
        {
            _baseSet = Array.Empty<int>();
            FocusCandidates.Clear();
            Results.Clear();
            SelectedResult = null;
            _workspacePreview = null;
            SummaryText = string.Empty;
            HasValidSource = false;
            OnPropertyChanged(nameof(WorkspacePreview));
        }

        private void SyncFocusCandidates()
        {
            FocusCandidates.Clear();
            foreach (var pc in _baseSet)
            {
                FocusCandidates.Add(pc);
            }

            if (FocusMode == FocusMode.Single)
            {
                if (!_selectedFocus.HasValue || !_baseSet.Contains(_selectedFocus.Value))
                {
                    SelectedFocus = _baseSet.FirstOrDefault();
                }
            }
            else
            {
                SelectedFocus = null;
            }
        }

        private void Recompute()
        {
            if (!_isActive) return;
            if (!HasValidSource || _sourceNode == null || _baseSet.Length == 0)
            {
                Results.Clear();
                SummaryText = string.Empty;
                SelectedResult = null;
                return;
            }

            var modulus = _sourceNode.Modulus;
            var focusList = ResolveFoci();
            var baseHash = string.Join(",", _baseSet);
            var key = new FocusAffineCacheKey(
                _sourceNode.NodeId,
                modulus,
                MultiplierA,
                FocusMode,
                FocusMode == FocusMode.Single ? (int?)focusList.FirstOrDefault() : null,
                baseHash);

            if (_cache.TryGetValue(key, out var cached))
            {
                ApplyResults(cached, focusList);
                return;
            }

            var rows = new List<FocusAffineResultRow>();
            foreach (var focus in focusList)
            {
                var result = FocusAffineMath.ComputeFocusAffine(_baseSet, modulus, MultiplierA, focus);
                var resultSet = new PCSet(modulus, result);
                var iv = IntervalVectorIndexService.ComputeIntervalVector(result, modulus);
                rows.Add(new FocusAffineResultRow(focus, resultSet, iv, _baseSet.Length));
            }

            _cache[key] = rows;
            ApplyResults(rows, focusList);
        }

        private int[] ResolveFoci()
        {
            if (FocusMode == FocusMode.Single)
            {
                if (_selectedFocus.HasValue && _baseSet.Contains(_selectedFocus.Value))
                {
                    return new[] { _selectedFocus.Value };
                }
                return _baseSet.Length > 0 ? new[] { _baseSet[0] } : Array.Empty<int>();
            }
            return _baseSet.ToArray();
        }

        private void ApplyResults(List<FocusAffineResultRow> rows, int[] focusList)
        {
            Results.Clear();
            foreach (var row in rows.OrderBy(r => r.Focus))
            {
                Results.Add(row);
            }
            SelectedResult = Results.FirstOrDefault();
            UpdateSummaryText(focusList);
            OnPropertyChanged(nameof(Results));
        }

        private void UpdateSummaryText(int[] focusList)
        {
            if (_baseSet.Length == 0)
            {
                SummaryText = string.Empty;
                return;
            }
            var baseSetDisplay = $"[{string.Join(' ', _baseSet)}]";
            var focusDisplay = focusList.Length == 0
                ? "-"
                : $"[{string.Join(' ', focusList)}]";
            SummaryText = $"PitchList {baseSetDisplay} at Focus {focusDisplay} with multiplier {MultiplierA}";
        }

        private void UpdateWorkspacePreview(FocusAffineResultRow? row)
        {
            if (row == null || _sourceNode == null)
            {
                _workspacePreview = null;
                OnPropertyChanged(nameof(WorkspacePreview));
                return;
            }

            var pcs = row.ResultSet.Members.ToArray();
            var node = new AtomicNode
            {
                Modulus = row.ResultSet.Modulus,
                Mode = PcMode.Unordered,
                Ordered = pcs,
                Unordered = pcs,
                ValueType = AtomicValueType.PitchList,
                Label = "Preview"
            };

            var attributes = new List<WorkspacePreviewAttribute>
            {
                new WorkspacePreviewAttribute("Lens", "Focus Affine"),
                new WorkspacePreviewAttribute("Focus", row.Focus.ToString()),
                new WorkspacePreviewAttribute("Multiplier", MultiplierA.ToString()),
                new WorkspacePreviewAttribute("Modulus", row.ResultSet.Modulus.ToString()),
                new WorkspacePreviewAttribute("Result", row.ResultSet.ToBracketString()),
                new WorkspacePreviewAttribute("IV", row.IntervalVectorDisplay),
                new WorkspacePreviewAttribute("Card", row.Cardinality.ToString())
            };

            _workspacePreview = new WorkspacePreview(node, "chord", attributes);
            OnPropertyChanged(nameof(WorkspacePreview));
        }

        private void CommitSelected()
        {
            if (SelectedResult == null || _sourceNode == null) return;
            var current = _sourceNode;
            var currentPcs = current.Mode == PcMode.Ordered ? current.Ordered : current.Unordered;
            var currentSet = MusicUtils.NormalizeUnordered(currentPcs, current.Modulus);
            if (currentSet.SequenceEqual(SelectedResult.ResultSet.Members))
            {
                return;
            }

            var resultPcs = SelectedResult.ResultSet.Members.ToArray();
            var node = new AtomicNode
            {
                NodeId = Guid.NewGuid(),
                Modulus = SelectedResult.ResultSet.Modulus,
                Mode = PcMode.Unordered,
                Ordered = resultPcs,
                Unordered = resultPcs,
                ValueType = AtomicValueType.PitchList,
                OpFromPrev = new OpDescriptor
                {
                    OpType = "FocusAffine",
                    OperationLabel = $"Focus Affine f={SelectedResult.Focus}",
                    SourceLens = "FocusAffine",
                    SourceNodeId = current.NodeId,
                    OpParams = new Dictionary<string, object>
                    {
                        ["a"] = MultiplierA,
                        ["focus"] = SelectedResult.Focus,
                        ["modulus"] = SelectedResult.ResultSet.Modulus
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
                ["a"] = MultiplierA,
                ["focus"] = SelectedResult.Focus,
                ["modulus"] = SelectedResult.ResultSet.Modulus
            };
            _store.TransformState("FocusAffine", opParams, nextState);
        }

        private readonly record struct FocusAffineCacheKey(
            Guid NodeId,
            int Modulus,
            int Multiplier,
            FocusMode FocusMode,
            int? SelectedFocus,
            string BaseSetHash);
    }
}
