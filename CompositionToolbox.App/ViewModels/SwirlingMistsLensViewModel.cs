// Purpose: Swirling Mists Lens view model that exposes state and commands for its associated view.

using System;
using System.Collections.Generic;
using System.Collections.ObjectModel;
using System.Collections.Specialized;
using System.ComponentModel;
using System.Globalization;
using System.Linq;
using System.Windows.Media;
using System.Windows.Threading;
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using CompositionToolbox.App.Models;
using CompositionToolbox.App.Models.SwirlingMists;
using CompositionToolbox.App.Services.SwirlingMists;
using CompositionToolbox.App.Utilities;

namespace CompositionToolbox.App.ViewModels
{
    public enum SwirlingMistsExtractionMode
    {
        XWindow,
        TWindow
    }

    public enum SwirlingMistsFlattenPolicy
    {
        ByStratum,
        ByValue
    }

    public sealed class SwirlingMistsSnapshotRow
    {
        public SwirlingMistsSnapshotRow(int index, SwirlingMistsSnapshot snapshot)
        {
            Index = index;
            Snapshot = snapshot;
            Values = snapshot.Values;
        }

        public int Index { get; }
        public SwirlingMistsSnapshot Snapshot { get; }
        public double[] Values { get; }
        public double X => Snapshot.X;
        public double T => Snapshot.T;
    }

    public sealed class SwirlingMistsLensViewModel : ObservableObject, ILensPreviewSource, ILensActivation
    {
        private readonly MistField _field;
        private readonly WaveformTableCache _cache = new();
        private readonly DispatcherTimer _timer;
        private bool _isActive;
        private int _seed;
        private string _globalSeedText = string.Empty;
        private bool _isUpdatingGlobalSeed;
        private string _units = "generic";
        private double _currentT;
        private double _currentX;
        private double _timeStep = 0.25;
        private bool _isPlaying;
        private InterpolationKind _interpolation = InterpolationKind.Linear;
        private SwirlingMistsExtractionMode _extractionMode = SwirlingMistsExtractionMode.XWindow;
        private SwirlingMistsFlattenPolicy _flattenPolicy = SwirlingMistsFlattenPolicy.ByStratum;
        private double _xStart;
        private double _xEnd = 15;
        private double _tStart;
        private double _tEnd = 16;
        private int _sampleCount = 16;
        private double _fixedT;
        private double _fixedX;
        private SwirlingMistsSnapshotRow? _selectedSnapshotRow;
        private string _currentSnapshotDisplay = string.Empty;
        private string _flattenedPreview = string.Empty;
        private bool _isInitializing;
        private double _cursorX;
        private bool _separateCursorDots = true;

        public SwirlingMistsLensViewModel()
        {
            _isInitializing = true;
            _field = new MistField();
            for (var i = 0; i < 3; i++)
            {
                _field.Strata.Add(CreateDefaultStratum(i));
            }

            Strata = new ObservableCollection<SwirlingMistsStratumViewModel>(
                _field.Strata.Select((s, i) => new SwirlingMistsStratumViewModel(s, i + 1)));
            Strata.CollectionChanged += Strata_CollectionChanged;
            foreach (var stratum in Strata)
            {
                stratum.PropertyChanged += Stratum_PropertyChanged;
            }

            ExtractionRows = new ObservableCollection<SwirlingMistsSnapshotRow>();
            WaveformPreviews = new ObservableCollection<SwirlingMistsWaveformPreview>();
            CursorMarkers = new ObservableCollection<SwirlingMistsCursorMarker>();
            PreviewExtractionCommand = new RelayCommand(PreviewExtraction);
            AddStratumCommand = new RelayCommand(AddStratum);
            RemoveStratumCommand = new RelayCommand(RemoveSelectedStratum, () => SelectedStratum != null);
            TogglePlayCommand = new RelayCommand(TogglePlay);
            ApplyPresetCommand = new RelayCommand<string?>(ApplyPreset);
            SelectedStratum = Strata.FirstOrDefault();

            _timer = new DispatcherTimer(DispatcherPriority.Background)
            {
                Interval = TimeSpan.FromMilliseconds(33)
            };
            _timer.Tick += (_, _) => AdvanceTime();

            _fixedT = _currentT;
            _fixedX = _currentX;
            GlobalSeedText = GenerateSeedText();
            UpdateCurrentSnapshot();
            RefreshWaveformPreviews();
            _isInitializing = false;
            RemoveStratumCommand.NotifyCanExecuteChanged();
        }

        public ObservableCollection<SwirlingMistsStratumViewModel> Strata { get; }
        public ObservableCollection<SwirlingMistsSnapshotRow> ExtractionRows { get; }
        public ObservableCollection<SwirlingMistsWaveformPreview> WaveformPreviews { get; }
        public ObservableCollection<SwirlingMistsCursorMarker> CursorMarkers { get; }
        public Array WaveformKinds { get; } = Enum.GetValues(typeof(WaveformKind));
        public Array InterpolationKinds { get; } = Enum.GetValues(typeof(InterpolationKind));
        public Array ExtractionModes { get; } = Enum.GetValues(typeof(SwirlingMistsExtractionMode));
        public Array FlattenPolicies { get; } = Enum.GetValues(typeof(SwirlingMistsFlattenPolicy));

        public SwirlingMistsStratumViewModel? SelectedStratum
        {
            get => _selectedStratum;
            set
            {
                if (SetProperty(ref _selectedStratum, value))
                {
                    if (!_isInitializing)
                    {
                        RemoveStratumCommand.NotifyCanExecuteChanged();
                    }
                }
            }
        }
        private SwirlingMistsStratumViewModel? _selectedStratum;

        public int Seed
        {
            get => _seed;
            set
            {
                if (SetProperty(ref _seed, value))
                {
                    _field.Seed = value;
                    UpdateCurrentSnapshot();
                    RefreshWaveformPreviews();
                    RefreshExtractionPreview();
                }
            }
        }

        public string GlobalSeedText
        {
            get => _globalSeedText;
            set
            {
                if (SetProperty(ref _globalSeedText, value))
                {
                    if (_isUpdatingGlobalSeed)
                    {
                        return;
                    }

                    var cleaned = SeedHasher.NormalizeSeedText(value);
                    if (!string.Equals(cleaned, value, StringComparison.Ordinal))
                    {
                        _isUpdatingGlobalSeed = true;
                        _globalSeedText = cleaned;
                        OnPropertyChanged(nameof(GlobalSeedText));
                        _isUpdatingGlobalSeed = false;
                    }

                    Seed = SeedHasher.HashSeed(cleaned);
                }
            }
        }

        public string Units
        {
            get => _units;
            set
            {
                if (SetProperty(ref _units, value))
                {
                    _field.Units = value ?? string.Empty;
                }
            }
        }

        public double CurrentT
        {
            get => _currentT;
            set
            {
                if (SetProperty(ref _currentT, value))
                {
                    UpdateCurrentSnapshot();
                }
            }
        }

        public double CurrentX
        {
            get => _currentX;
            set
            {
                if (SetProperty(ref _currentX, value))
                {
                    UpdateCurrentSnapshot();
                }
            }
        }

        public double TimeStep
        {
            get => _timeStep;
            set => SetProperty(ref _timeStep, value);
        }

        public bool IsPlaying
        {
            get => _isPlaying;
            private set => SetProperty(ref _isPlaying, value);
        }

        public InterpolationKind Interpolation
        {
            get => _interpolation;
            set
            {
                if (SetProperty(ref _interpolation, value))
                {
                    UpdateCurrentSnapshot();
                }
            }
        }

        public SwirlingMistsExtractionMode ExtractionMode
        {
            get => _extractionMode;
            set => SetProperty(ref _extractionMode, value);
        }

        public SwirlingMistsFlattenPolicy FlattenPolicy
        {
            get => _flattenPolicy;
            set
            {
                if (SetProperty(ref _flattenPolicy, value))
                {
                    UpdateFlattenPreview();
                }
            }
        }

        public double XStart
        {
            get => _xStart;
            set => SetProperty(ref _xStart, value);
        }

        public double XEnd
        {
            get => _xEnd;
            set => SetProperty(ref _xEnd, value);
        }

        public double TStart
        {
            get => _tStart;
            set => SetProperty(ref _tStart, value);
        }

        public double TEnd
        {
            get => _tEnd;
            set => SetProperty(ref _tEnd, value);
        }

        public int SampleCount
        {
            get => _sampleCount;
            set => SetProperty(ref _sampleCount, value);
        }

        public double FixedT
        {
            get => _fixedT;
            set => SetProperty(ref _fixedT, value);
        }

        public double FixedX
        {
            get => _fixedX;
            set => SetProperty(ref _fixedX, value);
        }

        public SwirlingMistsSnapshotRow? SelectedSnapshotRow
        {
            get => _selectedSnapshotRow;
            set
            {
                if (SetProperty(ref _selectedSnapshotRow, value))
                {
                    ApplySelectionToCursor(value);
                }
            }
        }

        public string CurrentSnapshotDisplay
        {
            get => _currentSnapshotDisplay;
            private set => SetProperty(ref _currentSnapshotDisplay, value);
        }

        public string FlattenedPreview
        {
            get => _flattenedPreview;
            private set => SetProperty(ref _flattenedPreview, value);
        }

        public double CursorX
        {
            get => _cursorX;
            private set => SetProperty(ref _cursorX, value);
        }

        public bool SeparateCursorDots
        {
            get => _separateCursorDots;
            set
            {
                if (SetProperty(ref _separateCursorDots, value))
                {
                    UpdateCurrentSnapshot();
                }
            }
        }

        public WorkspacePreview? WorkspacePreview => null;

        public IRelayCommand PreviewExtractionCommand { get; }
        public IRelayCommand AddStratumCommand { get; }
        public IRelayCommand RemoveStratumCommand { get; }
        public IRelayCommand TogglePlayCommand { get; }
        public IRelayCommand ApplyPresetCommand { get; }

        public void Activate()
        {
            if (_isActive) return;
            _isActive = true;
            UpdateCurrentSnapshot();
        }

        public void Deactivate()
        {
            _isActive = false;
            if (_timer.IsEnabled)
            {
                _timer.Stop();
                IsPlaying = false;
            }
        }

        private void TogglePlay()
        {
            if (_timer.IsEnabled)
            {
                _timer.Stop();
                IsPlaying = false;
            }
            else
            {
                _timer.Start();
                IsPlaying = true;
            }
        }

        private void AdvanceTime()
        {
            if (!_isActive) return;
            CurrentT += TimeStep;
        }

        private void UpdateCurrentSnapshot()
        {
            var values = MistFieldEvaluator.EvaluateField(_field, CurrentT, CurrentX, Interpolation, _cache);
            CurrentSnapshotDisplay = string.Join(", ", values.Select(v => v.ToString("0.###", CultureInfo.InvariantCulture)));
            UpdateCursorMarkers(values);
            if (IsPlaying)
            {
                RefreshWaveformPreviews();
            }
        }

        private void PreviewExtraction()
        {
            IReadOnlyList<SwirlingMistsSnapshot> snapshots;
            if (ExtractionMode == SwirlingMistsExtractionMode.XWindow)
            {
                snapshots = SwirlingMistsExtractor.ExtractXWindow(
                    _field,
                    FixedT,
                    XStart,
                    XEnd,
                    SampleCount,
                    Interpolation,
                    _cache);
            }
            else
            {
                snapshots = SwirlingMistsExtractor.ExtractTWindow(
                    _field,
                    FixedX,
                    TStart,
                    TEnd,
                    SampleCount,
                    Interpolation,
                    _cache);
            }

            ExtractionRows.Clear();
            for (var i = 0; i < snapshots.Count; i++)
            {
                ExtractionRows.Add(new SwirlingMistsSnapshotRow(i, snapshots[i]));
            }
            UpdateFlattenPreview();
        }

        private void RefreshExtractionPreview()
        {
            if (ExtractionRows.Count == 0)
            {
                return;
            }

            PreviewExtraction();
        }

        private void UpdateFlattenPreview()
        {
            if (ExtractionRows.Count == 0)
            {
                FlattenedPreview = string.Empty;
                return;
            }

            var flattened = new List<double>();
            if (FlattenPolicy == SwirlingMistsFlattenPolicy.ByStratum)
            {
                var strataCount = ExtractionRows[0].Values.Length;
                for (var s = 0; s < strataCount; s++)
                {
                    foreach (var row in ExtractionRows)
                    {
                        if (s < row.Values.Length)
                        {
                            flattened.Add(row.Values[s]);
                        }
                    }
                }
            }
            else
            {
                foreach (var row in ExtractionRows)
                {
                    var sorted = row.Values.OrderBy(v => v).ToArray();
                    flattened.AddRange(sorted);
                }
            }

            FlattenedPreview = string.Join(", ", flattened.Select(v => v.ToString("0.###", CultureInfo.InvariantCulture)));
        }

        private void ApplySelectionToCursor(SwirlingMistsSnapshotRow? row)
        {
            if (row == null) return;

            if (ExtractionMode == SwirlingMistsExtractionMode.XWindow)
            {
                CurrentX = row.X;
            }
            else
            {
                CurrentT = row.T;
            }
        }

        private void AddStratum()
        {
            var stratum = CreateDefaultStratum(Strata.Count);
            _field.Strata.Add(stratum);
            var vm = new SwirlingMistsStratumViewModel(stratum, Strata.Count + 1);
            Strata.Add(vm);
            SelectedStratum = vm;
            UpdateCurrentSnapshot();
            RefreshWaveformPreviews();
        }

        private void RemoveSelectedStratum()
        {
            if (SelectedStratum == null) return;
            var index = Strata.IndexOf(SelectedStratum);
            if (index < 0) return;
            SelectedStratum.PropertyChanged -= Stratum_PropertyChanged;
            Strata.RemoveAt(index);
            _field.Strata.RemoveAt(index);
            for (var i = 0; i < Strata.Count; i++)
            {
                Strata[i].Index = i + 1;
            }
            SelectedStratum = Strata.FirstOrDefault();
            UpdateCurrentSnapshot();
            RefreshWaveformPreviews();
        }

        private void Strata_CollectionChanged(object? sender, NotifyCollectionChangedEventArgs e)
        {
            if (e.NewItems != null)
            {
                foreach (SwirlingMistsStratumViewModel item in e.NewItems)
                {
                    item.PropertyChanged += Stratum_PropertyChanged;
                }
            }
            if (e.OldItems != null)
            {
                foreach (SwirlingMistsStratumViewModel item in e.OldItems)
                {
                    item.PropertyChanged -= Stratum_PropertyChanged;
                }
            }
        }

        private void Stratum_PropertyChanged(object? sender, PropertyChangedEventArgs e)
        {
            UpdateCurrentSnapshot();
            RefreshWaveformPreviews();
        }

        private static Stratum CreateDefaultStratum(int index)
        {
            var palette = new[]
            {
                System.Windows.Media.Colors.DeepSkyBlue,
                System.Windows.Media.Colors.MediumSpringGreen,
                System.Windows.Media.Colors.MediumOrchid,
                System.Windows.Media.Colors.Gold,
                System.Windows.Media.Colors.OrangeRed
            };
            var seedText = GenerateSeedText();
            var stratum = new Stratum
            {
                Baseline = index,
                LoopLength = 16,
                Speed = 1.0,
                Phase0 = 0.0,
                RangeClamp = new ClampRange(-1.0, 1.0),
                Enabled = true,
                Color = palette[index % palette.Length],
                Waveform = new WaveformDefinition
                {
                    Kind = WaveformKind.Sine,
                    RandomWalk = new RandomWalkParams
                    {
                        Seed = SeedHasher.HashSeed(seedText),
                        StepSize = 0.25,
                        ClampMin = -1,
                        ClampMax = 1,
                        StartValue = 0,
                        BoundMode = RandomWalkBoundMode.Reflect,
                        SmoothingWindow = 0
                    }
                }
            };
            return stratum;
        }

        private void RefreshWaveformPreviews()
        {
            var desiredCount = _field.Strata.Count;
            while (WaveformPreviews.Count < desiredCount)
            {
                var index = WaveformPreviews.Count;
                WaveformPreviews.Add(new SwirlingMistsWaveformPreview(
                    $"Stratum {index + 1}",
                    new PointCollection(),
                    new System.Windows.Media.SolidColorBrush(System.Windows.Media.Colors.Transparent)));
            }
            while (WaveformPreviews.Count > desiredCount)
            {
                WaveformPreviews.RemoveAt(WaveformPreviews.Count - 1);
            }

            for (var i = 0; i < _field.Strata.Count; i++)
            {
                var stratum = _field.Strata[i];
                var preview = WaveformPreviews[i];
                var phaseOffset = stratum.Phase0 + stratum.Speed * CurrentT;
                preview.Points = BuildWaveformPreviewPoints(stratum, phaseOffset);
                preview.Label = $"Stratum {i + 1}";
                if (preview.Stroke is System.Windows.Media.SolidColorBrush brush)
                {
                    brush.Color = stratum.Color;
                }
            }
        }

        private PointCollection BuildWaveformPreviewPoints(Stratum stratum, double phaseOffset)
        {
            const int sampleCount = 64;
            var points = new PointCollection(sampleCount);
            var length = Math.Max(1, stratum.LoopLength);
            var clamp = NormalizeClamp(stratum.RangeClamp);
            var table = _cache.GetTable(stratum.Waveform, length, _field.Seed);
            for (var i = 0; i < sampleCount; i++)
            {
                var phase = i * (length / (double)(sampleCount - 1)) + phaseOffset;
                var delta = WaveformSampler.Sample(table, phase, InterpolationKind.Linear);
                delta = clamp.Clamp(delta);
                var normalized = NormalizeValue(delta, clamp.Min, clamp.Max);
                var x = i / (double)(sampleCount - 1) * 100.0;
                var y = 100.0 - normalized * 100.0;
                points.Add(new System.Windows.Point(x, y));
            }
            return points;
        }

        private void UpdateCursorMarkers(double[] values)
        {
            var maxLoop = _field.Strata.Count == 0 ? 1 : _field.Strata.Max(s => Math.Max(1, s.LoopLength));
            var xWrapped = CurrentX % maxLoop;
            if (xWrapped < 0)
            {
                xWrapped += maxLoop;
            }
            CursorX = (xWrapped / maxLoop) * 100.0;

            if (CursorMarkers.Count != _field.Strata.Count)
            {
                CursorMarkers.Clear();
                for (var i = 0; i < _field.Strata.Count; i++)
                {
                    CursorMarkers.Add(new SwirlingMistsCursorMarker(
                        0,
                        0,
                        i + 1,
                        new System.Windows.Media.SolidColorBrush(System.Windows.Media.Colors.Transparent)));
                }
            }

            var offsetStart = SeparateCursorDots ? -((_field.Strata.Count - 1) * 2.0) : 0.0;
            for (var i = 0; i < _field.Strata.Count; i++)
            {
                var stratum = _field.Strata[i];
                var clamp = NormalizeClamp(stratum.RangeClamp);
                var delta = values[i] - stratum.Baseline;
                delta = clamp.Clamp(delta);
                var normalized = NormalizeValue(delta, clamp.Min, clamp.Max);
                var y = 100.0 - normalized * 100.0;
                var xOffset = SeparateCursorDots ? offsetStart + (i * 4.0) : 0.0;
                var marker = CursorMarkers[i];
                marker.Left = CursorX - 3.0 + xOffset;
                marker.Top = y - 3.0;
                if (marker.Fill is System.Windows.Media.SolidColorBrush brush)
                {
                    brush.Color = stratum.Color;
                }
            }
        }

        private static ClampRange NormalizeClamp(ClampRange clamp)
        {
            return clamp.Max >= clamp.Min ? clamp : new ClampRange(clamp.Max, clamp.Min);
        }

        private static double NormalizeValue(double value, double min, double max)
        {
            if (Math.Abs(max - min) < 0.0001)
            {
                return 0.5;
            }

            return Math.Clamp((value - min) / (max - min), 0.0, 1.0);
        }

        private static string GenerateSeedText()
        {
            const string alphabet = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
            var chars = new char[8];
            for (var i = 0; i < chars.Length; i++)
            {
                chars[i] = alphabet[Random.Shared.Next(alphabet.Length)];
            }
            return new string(chars);
        }

        private void ApplyPreset(string? presetName)
        {
            switch (presetName)
            {
                case "Soft Drift":
                    ApplyPresetSoftDrift();
                    break;
                case "Ripple":
                    ApplyPresetRipple();
                    break;
                case "Misty Walk":
                    ApplyPresetMistyWalk();
                    break;
            }
        }

        private void ApplyPresetSoftDrift()
        {
            EnsureStrataCount(3);
            for (var i = 0; i < _field.Strata.Count; i++)
            {
                var stratum = _field.Strata[i];
                stratum.Waveform.Kind = WaveformKind.Sine;
                stratum.LoopLength = 32;
                stratum.Speed = 0.25 + i * 0.05;
                stratum.Phase0 = i * 2.0;
                stratum.Baseline = i * 0.5;
                stratum.RangeClamp = new ClampRange(-0.4, 0.4);
            }
            RefreshStrataViewModels();
        }

        private void ApplyPresetRipple()
        {
            EnsureStrataCount(3);
            for (var i = 0; i < _field.Strata.Count; i++)
            {
                var stratum = _field.Strata[i];
                stratum.Waveform.Kind = WaveformKind.Sine;
                stratum.LoopLength = 16;
                stratum.Speed = 1.0 + i * 0.2;
                stratum.Phase0 = i * 4.0;
                stratum.Baseline = i;
                stratum.RangeClamp = new ClampRange(-1.0, 1.0);
            }
            RefreshStrataViewModels();
        }

        private void ApplyPresetMistyWalk()
        {
            EnsureStrataCount(3);
            for (var i = 0; i < _field.Strata.Count; i++)
            {
                var stratum = _field.Strata[i];
                stratum.Waveform.Kind = WaveformKind.RandomWalk;
                stratum.LoopLength = 24;
                stratum.Speed = 0.5;
                stratum.Phase0 = 0;
                stratum.Baseline = i * 0.6;
                stratum.RangeClamp = new ClampRange(-0.8, 0.8);
                stratum.Waveform.RandomWalk.Seed = i + 1;
                stratum.Waveform.RandomWalk.StepSize = 0.15 + i * 0.05;
                stratum.Waveform.RandomWalk.ClampMin = -0.8;
                stratum.Waveform.RandomWalk.ClampMax = 0.8;
                stratum.Waveform.RandomWalk.StartValue = 0;
                stratum.Waveform.RandomWalk.SmoothingWindow = 2;
            }
            RefreshStrataViewModels();
        }

        private void EnsureStrataCount(int count)
        {
            while (_field.Strata.Count < count)
            {
                var stratum = CreateDefaultStratum(_field.Strata.Count);
                _field.Strata.Add(stratum);
                var vm = new SwirlingMistsStratumViewModel(stratum, Strata.Count + 1);
                Strata.Add(vm);
            }

            while (_field.Strata.Count > count)
            {
                _field.Strata.RemoveAt(_field.Strata.Count - 1);
                Strata.RemoveAt(Strata.Count - 1);
            }
        }

        private void RefreshStrataViewModels()
        {
            for (var i = 0; i < Strata.Count; i++)
            {
                Strata[i].Index = i + 1;
                Strata[i].RefreshFromModel();
            }
            SelectedStratum = Strata.FirstOrDefault();
            UpdateCurrentSnapshot();
            RefreshWaveformPreviews();
        }
    }

    public sealed class SwirlingMistsWaveformPreview : ObservableObject
    {
        private string _label;
        private PointCollection _points;
        private System.Windows.Media.Brush _stroke;

        public SwirlingMistsWaveformPreview(string label, PointCollection points, System.Windows.Media.Brush stroke)
        {
            _label = label;
            _points = points;
            _stroke = stroke;
        }

        public string Label
        {
            get => _label;
            set => SetProperty(ref _label, value);
        }

        public PointCollection Points
        {
            get => _points;
            set => SetProperty(ref _points, value);
        }

        public System.Windows.Media.Brush Stroke
        {
            get => _stroke;
            set => SetProperty(ref _stroke, value);
        }
    }

    public sealed class SwirlingMistsCursorMarker : ObservableObject
    {
        private double _left;
        private double _top;
        private System.Windows.Media.Brush _fill;

        public SwirlingMistsCursorMarker(double left, double top, int index, System.Windows.Media.Brush fill)
        {
            _left = left;
            _top = top;
            Index = index;
            _fill = fill;
        }

        public double Left
        {
            get => _left;
            set => SetProperty(ref _left, value);
        }

        public double Top
        {
            get => _top;
            set => SetProperty(ref _top, value);
        }

        public int Index { get; }

        public System.Windows.Media.Brush Fill
        {
            get => _fill;
            set => SetProperty(ref _fill, value);
        }
    }

    public sealed class SwirlingMistsStratumViewModel : ObservableObject
    {
        private readonly Stratum _model;
        private int _index;
        private string _customTableText = string.Empty;
        private string _customTableStatus = string.Empty;
        private bool _isParsingCustomTable;
        private System.Windows.Media.SolidColorBrush _colorBrush;
        private bool _isCustomTableRandomizerOpen;
        private int _randomTableCount;
        private double _randomTableMin = 0.0;
        private double _randomTableMax = 1.0;
        private double _randomTableStep = 0.1;
        private string _randomWalkSeedText = string.Empty;
        private bool _isUpdatingSeedText;

        public SwirlingMistsStratumViewModel(Stratum model, int index)
        {
            _model = model;
            _index = index;
            _customTableText = string.Join(", ", _model.Waveform.CustomTable.Select(v => v.ToString("0.###", CultureInfo.InvariantCulture)));
            _colorBrush = new System.Windows.Media.SolidColorBrush(_model.Color);
            _randomTableCount = Math.Max(1, _model.LoopLength);
            PickColorCommand = new RelayCommand(PickColor);
            RandomizeSeedCommand = new RelayCommand(RandomizeSeed);
            GenerateRandomCustomTableCommand = new RelayCommand(GenerateRandomCustomTable);
            CloseRandomizeCustomTableCommand = new RelayCommand(() => IsCustomTableRandomizerOpen = false);
            _randomWalkSeedText = SeedHasher.SeedTextFromInt(_model.Waveform.RandomWalk.Seed);
        }

        public int Index
        {
            get => _index;
            set => SetProperty(ref _index, value);
        }

        public bool Enabled
        {
            get => _model.Enabled;
            set
            {
                if (SetProperty(_model.Enabled, value, v => _model.Enabled = v))
                {
                    OnPropertyChanged(nameof(SummaryText));
                }
            }
        }

        public double Baseline
        {
            get => _model.Baseline;
            set
            {
                if (SetProperty(_model.Baseline, value, v => _model.Baseline = v))
                {
                    OnPropertyChanged(nameof(SummaryText));
                }
            }
        }

        public int LoopLength
        {
            get => _model.LoopLength;
            set
            {
                if (SetProperty(_model.LoopLength, Math.Max(1, value), v => _model.LoopLength = v))
                {
                    OnPropertyChanged(nameof(PhaseDegrees));
                    OnPropertyChanged(nameof(SummaryText));
                }
            }
        }

        public double Speed
        {
            get => _model.Speed;
            set
            {
                if (SetProperty(_model.Speed, value, v => _model.Speed = v))
                {
                    OnPropertyChanged(nameof(SummaryText));
                }
            }
        }

        public double Phase0
        {
            get => _model.Phase0;
            set
            {
                if (SetProperty(_model.Phase0, value, v => _model.Phase0 = v))
                {
                    OnPropertyChanged(nameof(PhaseDegrees));
                    OnPropertyChanged(nameof(SummaryText));
                }
            }
        }

        public double PhaseDegrees
        {
            get
            {
                var length = Math.Max(1, LoopLength);
                return (Phase0 / length) * 360.0;
            }
            set
            {
                var length = Math.Max(1, LoopLength);
                var clamped = Math.Clamp(value, 0.0, 360.0);
                Phase0 = clamped / 360.0 * length;
            }
        }

        public double ClampMin
        {
            get => _model.RangeClamp.Min;
            set
            {
                var clamp = _model.RangeClamp;
                var next = new ClampRange(value, clamp.Max);
                _model.RangeClamp = next;
                OnPropertyChanged();
                OnPropertyChanged(nameof(SummaryText));
            }
        }

        public double ClampMax
        {
            get => _model.RangeClamp.Max;
            set
            {
                var clamp = _model.RangeClamp;
                var next = new ClampRange(clamp.Min, value);
                _model.RangeClamp = next;
                OnPropertyChanged();
                OnPropertyChanged(nameof(SummaryText));
            }
        }

        public WaveformKind WaveformKind
        {
            get => _model.Waveform.Kind;
            set
            {
                if (SetProperty(_model.Waveform.Kind, value, v => _model.Waveform.Kind = v))
                {
                    OnPropertyChanged(nameof(SummaryText));
                }
            }
        }

        public int RandomWalkSeed
        {
            get => _model.Waveform.RandomWalk.Seed;
            set
            {
                if (SetProperty(_model.Waveform.RandomWalk.Seed, value, v => _model.Waveform.RandomWalk.Seed = v))
                {
                    SetSeedTextFromModel(value);
                }
            }
        }

        public string RandomWalkSeedText
        {
            get => _randomWalkSeedText;
            set
            {
                if (SetProperty(ref _randomWalkSeedText, value))
                {
                    if (_isUpdatingSeedText)
                    {
                        return;
                    }

                    var cleaned = SeedHasher.NormalizeSeedText(value);
                    if (!string.Equals(cleaned, value, StringComparison.Ordinal))
                    {
                        _isUpdatingSeedText = true;
                        _randomWalkSeedText = cleaned;
                        OnPropertyChanged(nameof(RandomWalkSeedText));
                        _isUpdatingSeedText = false;
                    }
                    _model.Waveform.RandomWalk.Seed = SeedHasher.HashSeed(cleaned);
                }
            }
        }

        public double RandomWalkStepSize
        {
            get => _model.Waveform.RandomWalk.StepSize;
            set
            {
                if (SetProperty(_model.Waveform.RandomWalk.StepSize, value, v => _model.Waveform.RandomWalk.StepSize = v))
                {
                    OnPropertyChanged(nameof(SummaryText));
                }
            }
        }

        public double RandomWalkClampMin
        {
            get => _model.Waveform.RandomWalk.ClampMin;
            set => SetProperty(_model.Waveform.RandomWalk.ClampMin, value, v => _model.Waveform.RandomWalk.ClampMin = v);
        }

        public double RandomWalkClampMax
        {
            get => _model.Waveform.RandomWalk.ClampMax;
            set => SetProperty(_model.Waveform.RandomWalk.ClampMax, value, v => _model.Waveform.RandomWalk.ClampMax = v);
        }

        public double RandomWalkStartValue
        {
            get => _model.Waveform.RandomWalk.StartValue;
            set => SetProperty(_model.Waveform.RandomWalk.StartValue, value, v => _model.Waveform.RandomWalk.StartValue = v);
        }

        public int RandomWalkSmoothing
        {
            get => _model.Waveform.RandomWalk.SmoothingWindow;
            set
            {
                if (SetProperty(_model.Waveform.RandomWalk.SmoothingWindow, Math.Max(0, value), v => _model.Waveform.RandomWalk.SmoothingWindow = v))
                {
                    OnPropertyChanged(nameof(SummaryText));
                }
            }
        }

        public string CustomTableText
        {
            get => _customTableText;
            set
            {
                if (SetProperty(ref _customTableText, value) && !_isParsingCustomTable)
                {
                    ParseCustomTableText(value);
                }
            }
        }

        public string CustomTableStatus
        {
            get => _customTableStatus;
            private set => SetProperty(ref _customTableStatus, value);
        }

        public bool IsCustomTableRandomizerOpen
        {
            get => _isCustomTableRandomizerOpen;
            set => SetProperty(ref _isCustomTableRandomizerOpen, value);
        }

        public int RandomTableCount
        {
            get => _randomTableCount;
            set => SetProperty(ref _randomTableCount, Math.Max(1, value));
        }

        public double RandomTableMin
        {
            get => _randomTableMin;
            set => SetProperty(ref _randomTableMin, value);
        }

        public double RandomTableMax
        {
            get => _randomTableMax;
            set => SetProperty(ref _randomTableMax, value);
        }

        public double RandomTableStep
        {
            get => _randomTableStep;
            set => SetProperty(ref _randomTableStep, value);
        }

        public System.Windows.Media.Color Color
        {
            get => _model.Color;
            set
            {
                if (SetProperty(_model.Color, value, v => _model.Color = v))
                {
                    ColorBrush = new System.Windows.Media.SolidColorBrush(value);
                }
            }
        }

        public System.Windows.Media.SolidColorBrush ColorBrush
        {
            get => _colorBrush;
            private set => SetProperty(ref _colorBrush, value);
        }

        public IRelayCommand PickColorCommand { get; }
        public IRelayCommand RandomizeSeedCommand { get; }
        public IRelayCommand GenerateRandomCustomTableCommand { get; }
        public IRelayCommand CloseRandomizeCustomTableCommand { get; }

        public string SummaryText
            => $"L={LoopLength} v={Speed:0.##} phi={PhaseDegrees:0.#}deg [{ClampMin:0.##},{ClampMax:0.##}] {WaveformKind}";

        public void RefreshFromModel()
        {
            _customTableText = string.Join(", ", _model.Waveform.CustomTable.Select(v => v.ToString("0.###", CultureInfo.InvariantCulture)));
            OnPropertyChanged(nameof(Enabled));
            OnPropertyChanged(nameof(Baseline));
            OnPropertyChanged(nameof(LoopLength));
            OnPropertyChanged(nameof(Speed));
            OnPropertyChanged(nameof(Phase0));
            OnPropertyChanged(nameof(ClampMin));
            OnPropertyChanged(nameof(ClampMax));
            OnPropertyChanged(nameof(WaveformKind));
            OnPropertyChanged(nameof(RandomWalkSeed));
            OnPropertyChanged(nameof(RandomWalkStepSize));
            OnPropertyChanged(nameof(RandomWalkClampMin));
            OnPropertyChanged(nameof(RandomWalkClampMax));
            OnPropertyChanged(nameof(RandomWalkStartValue));
            OnPropertyChanged(nameof(RandomWalkSmoothing));
            SetSeedTextFromModel(_model.Waveform.RandomWalk.Seed);
            OnPropertyChanged(nameof(CustomTableText));
            OnPropertyChanged(nameof(CustomTableStatus));
            ColorBrush = new System.Windows.Media.SolidColorBrush(_model.Color);
            OnPropertyChanged(nameof(Color));
            OnPropertyChanged(nameof(ColorBrush));
            OnPropertyChanged(nameof(SummaryText));
        }

        private void ParseCustomTableText(string value)
        {
            _isParsingCustomTable = true;
            try
            {
                var parts = value.Split(new[] { ',', ' ', '\t', '\r', '\n' }, StringSplitOptions.RemoveEmptyEntries);
                var parsed = new List<double>();
                foreach (var part in parts)
                {
                    if (TryParseDouble(part, out var number))
                    {
                        parsed.Add(number);
                    }
                    else
                    {
                        CustomTableStatus = $"Invalid number: {part}";
                        return;
                    }
                }

                _model.Waveform.CustomTable = parsed.ToArray();
                CustomTableStatus = parsed.Count == 0 ? "Custom table is empty." : string.Empty;
                OnPropertyChanged(nameof(SummaryText));
            }
            finally
            {
                _isParsingCustomTable = false;
            }
        }

        private void GenerateRandomCustomTable()
        {
            var count = Math.Max(1, RandomTableCount);
            var min = Math.Clamp(RandomTableMin, 0.0, 1.0);
            var max = Math.Clamp(RandomTableMax, 0.0, 1.0);
            if (max < min)
            {
                (min, max) = (max, min);
            }

            var step = RandomTableStep;
            if (step <= 0)
            {
                step = 0.01;
            }

            var steps = (int)Math.Floor((max - min) / step);
            if (steps < 0)
            {
                steps = 0;
            }

            var rng = new Random();
            var values = new double[count];
            for (var i = 0; i < count; i++)
            {
                var pick = steps == 0 ? 0 : rng.Next(steps + 1);
                values[i] = min + (pick * step);
            }

            CustomTableText = string.Join(
                ", ",
                values.Select(v => v.ToString("0.###", CultureInfo.InvariantCulture)));
            IsCustomTableRandomizerOpen = false;
        }

        private void RandomizeSeed()
        {
            const string alphabet = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
            var rng = new Random();
            var chars = new char[8];
            for (var i = 0; i < chars.Length; i++)
            {
                chars[i] = alphabet[rng.Next(alphabet.Length)];
            }
            RandomWalkSeedText = new string(chars);
        }

        private void PickColor()
        {
            var dialog = new System.Windows.Forms.ColorDialog
            {
                AllowFullOpen = true,
                AnyColor = true,
                FullOpen = true,
                Color = System.Drawing.Color.FromArgb(_model.Color.A, _model.Color.R, _model.Color.G, _model.Color.B)
            };

            if (dialog.ShowDialog() == System.Windows.Forms.DialogResult.OK)
            {
                var c = dialog.Color;
                Color = System.Windows.Media.Color.FromArgb(c.A, c.R, c.G, c.B);
            }
        }

        private void SetSeedTextFromModel(int seed)
        {
            var text = SeedHasher.SeedTextFromInt(seed);
            _isUpdatingSeedText = true;
            _randomWalkSeedText = text;
            OnPropertyChanged(nameof(RandomWalkSeedText));
            _isUpdatingSeedText = false;
        }

        private static bool TryParseDouble(string text, out double value)
        {
            return double.TryParse(text, NumberStyles.Float, CultureInfo.CurrentCulture, out value)
                   || double.TryParse(text, NumberStyles.Float, CultureInfo.InvariantCulture, out value);
        }
    }
}
