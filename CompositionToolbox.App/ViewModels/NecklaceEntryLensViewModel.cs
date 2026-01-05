using System;
using System.Collections.Generic;
using System.Collections.ObjectModel;
using System.Linq;
using System.Windows.Media;
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using CompositionToolbox.App.Models;
using CompositionToolbox.App.Stores;

namespace CompositionToolbox.App.ViewModels
{
    public sealed class NecklaceEntryLensViewModel : ObservableObject, ILensPreviewSource, ILensActivation
    {
        private readonly CompositeStore _store;
        private readonly Func<int> _getModulus;
        private readonly Dictionary<int, System.Windows.Point> _pcPositions = new();
        private bool _isActive;
        private bool _pendingLayout;
        private bool _pendingModulus;
        private int _modulus;
        private double _viewportWidth;
        private double _viewportHeight;
        private double _circleLeft;
        private double _circleTop;
        private double _circleDiameter;
        private double _nodeDiameter = 10;
        private IReadOnlyList<System.Windows.Point> _nodePositions = Array.Empty<System.Windows.Point>();
        private IReadOnlyList<(System.Windows.Point A, System.Windows.Point B)> _segments = Array.Empty<(System.Windows.Point A, System.Windows.Point B)>();
        private PointCollection _polylinePoints = new();
        private int _cardinality;
        private string _orderDisplay = string.Empty;
        private int? _lastSelected;
        private WorkspacePreview? _workspacePreview;

        public NecklaceEntryLensViewModel(CompositeStore store, Func<int> getModulus)
        {
            _store = store;
            _getModulus = getModulus;
            _modulus = Math.Max(1, getModulus());

            Order = new ObservableCollection<int>();
            Nodes = new ObservableCollection<NecklaceNodeViewModel>();
            Enabled = new HashSet<int>();

            TogglePcCommand = new RelayCommand<int>(TogglePc);
            ClearCommand = new RelayCommand(Clear);
            BackspaceCommand = new RelayCommand(RemoveLast, () => Order.Count > 0);
            CommitCommand = new RelayCommand(Commit, () => Order.Count > 0);

            BuildNodes();
            UpdateDerivedState();
        }

        public int Modulus
        {
            get => _modulus;
            private set => SetProperty(ref _modulus, value);
        }

        public ObservableCollection<int> Order { get; }

        public HashSet<int> Enabled { get; }

        public int? LastSelected
        {
            get => _lastSelected;
            private set => SetProperty(ref _lastSelected, value);
        }

        public IReadOnlyList<System.Windows.Point> NodePositions
        {
            get => _nodePositions;
            private set => SetProperty(ref _nodePositions, value);
        }

        public IReadOnlyList<(System.Windows.Point A, System.Windows.Point B)> Segments
        {
            get => _segments;
            private set => SetProperty(ref _segments, value);
        }

        public ObservableCollection<NecklaceNodeViewModel> Nodes { get; }

        public PointCollection PolylinePoints
        {
            get => _polylinePoints;
            private set => SetProperty(ref _polylinePoints, value);
        }

        public double CircleLeft
        {
            get => _circleLeft;
            private set => SetProperty(ref _circleLeft, value);
        }

        public double CircleTop
        {
            get => _circleTop;
            private set => SetProperty(ref _circleTop, value);
        }

        public double CircleDiameter
        {
            get => _circleDiameter;
            private set => SetProperty(ref _circleDiameter, value);
        }

        public double NodeDiameter
        {
            get => _nodeDiameter;
            private set => SetProperty(ref _nodeDiameter, value);
        }

        public int Cardinality
        {
            get => _cardinality;
            private set => SetProperty(ref _cardinality, value);
        }

        public string OrderDisplay
        {
            get => _orderDisplay;
            private set => SetProperty(ref _orderDisplay, value);
        }

        public WorkspacePreview? WorkspacePreview => _workspacePreview;

        public IRelayCommand TogglePcCommand { get; }
        public IRelayCommand ClearCommand { get; }
        public IRelayCommand BackspaceCommand { get; }
        public IRelayCommand CommitCommand { get; }

        public void Activate()
        {
            if (_isActive) return;
            _isActive = true;
            if (_pendingModulus)
            {
                ApplyModulus(_getModulus());
                _pendingModulus = false;
            }
            if (_pendingLayout)
            {
                UpdateGeometry();
                _pendingLayout = false;
            }
            UpdateWorkspacePreview();
        }

        public void Deactivate()
        {
            _isActive = false;
        }

        public void RefreshForModulusChange()
        {
            if (!_isActive)
            {
                _pendingModulus = true;
                return;
            }
            ApplyModulus(_getModulus());
        }

        public void SetViewportSize(double width, double height)
        {
            _viewportWidth = width;
            _viewportHeight = height;
            if (width <= 0 || height <= 0)
            {
                _pendingLayout = true;
                return;
            }
            if (!_isActive)
            {
                _pendingLayout = true;
                return;
            }
            UpdateGeometry();
        }

        private void ApplyModulus(int modulus)
        {
            var next = Math.Max(1, modulus);
            if (next == Modulus) return;
            Modulus = next;
            ClearSelection();
            BuildNodes();
            UpdateGeometry();
        }

        private void BuildNodes()
        {
            Nodes.Clear();
            for (var pc = 0; pc < Modulus; pc++)
            {
                Nodes.Add(new NecklaceNodeViewModel(pc));
            }
        }

        private void UpdateGeometry()
        {
            if (Modulus <= 0 || _viewportWidth <= 0 || _viewportHeight <= 0)
            {
                NodePositions = Array.Empty<System.Windows.Point>();
                PolylinePoints = new PointCollection();
                Segments = Array.Empty<(System.Windows.Point A, System.Windows.Point B)>();
                return;
            }

            var padding = 16.0;
            var diameter = Math.Max(0, Math.Min(_viewportWidth, _viewportHeight) - (padding * 2));
            var radius = diameter / 2.0;
            var center = new System.Windows.Point(_viewportWidth / 2.0, _viewportHeight / 2.0);

            CircleDiameter = diameter;
            CircleLeft = center.X - radius;
            CircleTop = center.Y - radius;

            NodeDiameter = Math.Max(6, Math.Min(16, radius * 0.18));

            var positions = new List<System.Windows.Point>(Modulus);
            _pcPositions.Clear();
            for (var pc = 0; pc < Modulus; pc++)
            {
                var angle = -Math.PI / 2.0 + (2.0 * Math.PI * pc / Modulus);
                var x = center.X + (radius * Math.Cos(angle));
                var y = center.Y + (radius * Math.Sin(angle));
                var point = new System.Windows.Point(x, y);
                positions.Add(point);
                _pcPositions[pc] = point;
            }

            NodePositions = positions;
            UpdateNodePositions();
            UpdateDerivedState();
        }

        private void UpdateNodePositions()
        {
            for (var i = 0; i < Nodes.Count; i++)
            {
                var node = Nodes[i];
                if (_pcPositions.TryGetValue(node.Pc, out var point))
                {
                    node.UpdateGeometry(point, NodeDiameter);
                }
            }
        }

        private void TogglePc(int pc)
        {
            if (pc < 0 || pc >= Modulus) return;

            if (Enabled.Contains(pc))
            {
                Enabled.Remove(pc);
                Order.Remove(pc);
                SetNodeSelected(pc, false);
            }
            else
            {
                Enabled.Add(pc);
                Order.Add(pc);
                SetNodeSelected(pc, true);
            }

            UpdateDerivedState();
        }

        private void Clear()
        {
            if (Order.Count == 0 && Enabled.Count == 0) return;
            ClearSelection();
            UpdateDerivedState();
        }

        private void ClearSelection()
        {
            Order.Clear();
            Enabled.Clear();
            foreach (var node in Nodes)
            {
                node.IsSelected = false;
            }
        }

        private void RemoveLast()
        {
            if (Order.Count == 0) return;
            var pc = Order[^1];
            Order.RemoveAt(Order.Count - 1);
            Enabled.Remove(pc);
            SetNodeSelected(pc, false);
            UpdateDerivedState();
        }

        private void SetNodeSelected(int pc, bool isSelected)
        {
            var node = Nodes.FirstOrDefault(n => n.Pc == pc);
            if (node != null)
            {
                node.IsSelected = isSelected;
            }
        }

        private void UpdateDerivedState()
        {
            Cardinality = Order.Count;
            OrderDisplay = Order.Count == 0 ? string.Empty : $"({string.Join(' ', Order)})";
            LastSelected = Order.Count == 0 ? null : Order[^1];

            BuildPolylinePoints();
            BuildSegments();
            UpdateWorkspacePreview();

            BackspaceCommand.NotifyCanExecuteChanged();
            CommitCommand.NotifyCanExecuteChanged();
        }

        private void BuildPolylinePoints()
        {
            if (Order.Count == 0 || _pcPositions.Count == 0)
            {
                PolylinePoints = new PointCollection();
                return;
            }

            var points = new PointCollection();
            foreach (var pc in Order)
            {
                if (_pcPositions.TryGetValue(pc, out var point))
                {
                    points.Add(point);
                }
            }

            PolylinePoints = points;
        }

        private void BuildSegments()
        {
            if (Order.Count < 2 || _pcPositions.Count == 0)
            {
                Segments = Array.Empty<(System.Windows.Point A, System.Windows.Point B)>();
                return;
            }

            var segments = new List<(System.Windows.Point A, System.Windows.Point B)>();
            for (var i = 1; i < Order.Count; i++)
            {
                if (_pcPositions.TryGetValue(Order[i - 1], out var a)
                    && _pcPositions.TryGetValue(Order[i], out var b))
                {
                    segments.Add((a, b));
                }
            }

            Segments = segments;
        }

        private void UpdateWorkspacePreview()
        {
            if (Order.Count == 0)
            {
                _workspacePreview = null;
                OnPropertyChanged(nameof(WorkspacePreview));
                return;
            }

            var ordered = Order.ToArray();
            var node = new AtomicNode
            {
                Modulus = Modulus,
                Mode = PcMode.Ordered,
                Ordered = ordered,
                Unordered = MusicUtils.NormalizeUnordered(ordered, Modulus),
                ValueType = AtomicValueType.PitchList,
                Label = "Preview"
            };

            var attributes = WorkspacePreviewAttributeHelpers.BuildPcAttributes(ordered, Modulus, lensName: "Necklace Entry");
            _workspacePreview = new WorkspacePreview(node, "line", attributes);
            OnPropertyChanged(nameof(WorkspacePreview));
        }

        private void Commit()
        {
            if (Order.Count == 0) return;

            var ordered = Order.ToArray();
            var node = new AtomicNode
            {
                NodeId = Guid.NewGuid(),
                Modulus = Modulus,
                Mode = PcMode.Ordered,
                Ordered = ordered,
                Unordered = MusicUtils.NormalizeUnordered(ordered, Modulus),
                ValueType = AtomicValueType.PitchList,
                Label = "Necklace Entry",
                OpFromPrev = new OpDescriptor
                {
                    OpType = "Necklace Entry",
                    OperationLabel = "Necklace Entry",
                    SourceLens = "Necklace Entry",
                    SourceNodeId = null,
                    OpParams = new Dictionary<string, object>
                    {
                        ["Modulus"] = Modulus,
                        ["Order"] = ordered.ToArray(),
                        ["Count"] = ordered.Length
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
                ["Modulus"] = Modulus,
                ["Order"] = ordered.ToArray(),
                ["Count"] = ordered.Length
            };

            _store.TransformState("Necklace Entry", opParams, nextState);
        }
    }

    public sealed class NecklaceNodeViewModel : ObservableObject
    {
        private double _left;
        private double _top;
        private double _diameter;
        private bool _isSelected;

        public NecklaceNodeViewModel(int pc)
        {
            Pc = pc;
        }

        public int Pc { get; }

        public double Left
        {
            get => _left;
            private set => SetProperty(ref _left, value);
        }

        public double Top
        {
            get => _top;
            private set => SetProperty(ref _top, value);
        }

        public double Diameter
        {
            get => _diameter;
            private set => SetProperty(ref _diameter, value);
        }

        public bool IsSelected
        {
            get => _isSelected;
            set => SetProperty(ref _isSelected, value);
        }

        public void UpdateGeometry(System.Windows.Point center, double diameter)
        {
            Diameter = diameter;
            Left = center.X - (diameter / 2.0);
            Top = center.Y - (diameter / 2.0);
        }
    }
}
