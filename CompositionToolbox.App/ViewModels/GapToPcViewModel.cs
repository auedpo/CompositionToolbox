using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using CompositionToolbox.App.Models;
using CompositionToolbox.App.Stores;
using System;
using System.Collections.Generic;
using System.Linq;

namespace CompositionToolbox.App.ViewModels
{
    public class GapToPcViewModel : ObservableObject, ILensPreviewSource, ILensActivation
    {
        private readonly CompositeStore _store;
        private readonly Func<int> _getModulus;
        private string _gapsInput = string.Empty;
        private string _rootInput = "0";
        private string _previewDisplay = string.Empty;
        private int _pcCount;
        private int[] _previewPcs = Array.Empty<int>();
        private int[] _previewGaps = Array.Empty<int>();
        private WorkspacePreview? _workspacePreview;
        private bool _isActive;
        private bool _pendingPreview;

        public GapToPcViewModel(CompositeStore store, Func<int> getModulus)
        {
            _store = store;
            _getModulus = getModulus;
            CreatePitchListCommand = new RelayCommand(CreatePitchListFromPreview, () => PreviewPcs.Length > 0);
            _pendingPreview = true;
        }

        public string GapsInput
        {
            get => _gapsInput;
            set
            {
                if (SetProperty(ref _gapsInput, value))
                {
                    UpdatePreview();
                }
            }
        }

        public string RootInput
        {
            get => _rootInput;
            set
            {
                if (SetProperty(ref _rootInput, value))
                {
                    UpdatePreview();
                }
            }
        }

        public string PreviewDisplay
        {
            get => _previewDisplay;
            private set => SetProperty(ref _previewDisplay, value);
        }

        public int PcCount
        {
            get => _pcCount;
            private set => SetProperty(ref _pcCount, value);
        }

        public int[] PreviewPcs
        {
            get => _previewPcs;
            private set => SetProperty(ref _previewPcs, value);
        }

        public int[] PreviewGaps
        {
            get => _previewGaps;
            private set => SetProperty(ref _previewGaps, value);
        }

        public WorkspacePreview? WorkspacePreview => _workspacePreview;

        public IRelayCommand CreatePitchListCommand { get; }

        public void Activate()
        {
            if (_isActive) return;
            _isActive = true;
            if (_pendingPreview)
            {
                UpdatePreview();
            }
        }

        public void Deactivate()
        {
            _isActive = false;
        }

        public void RefreshForModulusChange()
        {
            UpdatePreview();
        }

        private void UpdatePreview()
        {
            if (!_isActive)
            {
                _pendingPreview = true;
                return;
            }

            var modulus = _getModulus();
            var gaps = ParseInts(GapsInput);
            var root = ParseRoot(RootInput, modulus);
            var pcs = BuildPcsFromGaps(root, gaps, modulus);

            PreviewGaps = gaps;
            PreviewPcs = pcs;
            PcCount = pcs.Length;
            PreviewDisplay = pcs.Length == 0 ? string.Empty : $"({string.Join(' ', pcs)})";

            if (pcs.Length == 0)
            {
                _workspacePreview = null;
            }
            else
            {
                var node = new AtomicNode
                {
                    Modulus = modulus,
                    Mode = PcMode.Ordered,
                    Ordered = pcs.ToArray(),
                    Unordered = MusicUtils.NormalizeUnordered(pcs, modulus),
                    ValueType = AtomicValueType.PitchList,
                    Label = "Preview"
                };

                var attributes = new List<WorkspacePreviewAttribute>
                {
                    new WorkspacePreviewAttribute("Lens", "Gap -> PC"),
                    new WorkspacePreviewAttribute("PCs", $"({string.Join(' ', pcs)})"),
                    new WorkspacePreviewAttribute("Count", pcs.Length.ToString()),
                    new WorkspacePreviewAttribute("Gaps", $"[{string.Join(' ', gaps)}]")
                };

                _workspacePreview = new WorkspacePreview(node, "line", attributes);
            }

            OnPropertyChanged(nameof(WorkspacePreview));
            CreatePitchListCommand.NotifyCanExecuteChanged();
            _pendingPreview = false;
        }

        private static int[] ParseInts(string text)
        {
            if (string.IsNullOrWhiteSpace(text)) return Array.Empty<int>();
            var tokens = text.Split(new[] { ' ', ',', '\t', '\n', '\r' }, StringSplitOptions.RemoveEmptyEntries);
            return tokens.Select(t => int.TryParse(t, out var v) ? (int?)v : null)
                .Where(v => v.HasValue)
                .Select(v => v!.Value)
                .ToArray();
        }

        private static int ParseRoot(string text, int modulus)
        {
            if (!int.TryParse(text, out var root))
            {
                root = 0;
            }
            return modulus > 0 ? NormalizeMod(root, modulus) : root;
        }

        private static int[] BuildPcsFromGaps(int root, int[] gaps, int modulus)
        {
            var list = new List<int> { root };
            var current = root;
            foreach (var gap in gaps)
            {
                current += gap;
                list.Add(current);
            }

            if (modulus > 0)
            {
                for (int i = 0; i < list.Count; i++)
                {
                    list[i] = NormalizeMod(list[i], modulus);
                }
            }

            return list.ToArray();
        }

        private static int NormalizeMod(int value, int modulus)
        {
            var n = value % modulus;
            return n < 0 ? n + modulus : n;
        }

        private void CreatePitchListFromPreview()
        {
            if (PreviewPcs.Length == 0) return;
            var modulus = _getModulus();
            var ordered = PreviewPcs.ToArray();
            var unordered = MusicUtils.NormalizeUnordered(ordered, modulus);

            var node = new AtomicNode
            {
                Modulus = modulus,
                Mode = PcMode.Ordered,
                Ordered = ordered,
                Unordered = unordered,
                Label = "Gap",
                ValueType = AtomicValueType.PitchList,
                OpFromPrev = new OpDescriptor
                {
                    OpType = "GapToPc",
                    OperationLabel = "Gap -> PC",
                    SourceLens = "Gap -> PC",
                    SourceNodeId = null
                }
            };

            var nodeId = _store.GetOrAddNode(node);
            var prevState = _store.SelectedState;
            var compositeId = _store.SelectedComposite?.CompositeId ?? Guid.NewGuid();
            var nextState = new CompositeState
            {
                CompositeId = compositeId,
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
                ["modulus"] = modulus,
                ["root"] = ParseRoot(RootInput, modulus),
                ["gaps"] = PreviewGaps.ToArray(),
                ["pcs"] = ordered.ToArray()
            };

            _store.TransformState("Gap -> PC", opParams, nextState);
        }
    }
}
