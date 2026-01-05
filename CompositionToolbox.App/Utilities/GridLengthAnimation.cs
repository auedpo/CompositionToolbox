using System;
using System.Windows;
using System.Windows.Media.Animation;

namespace CompositionToolbox.App.Utilities
{
    public sealed class GridLengthAnimation : AnimationTimeline
    {
        public override Type TargetPropertyType => typeof(GridLength);

        public static readonly DependencyProperty FromProperty =
            DependencyProperty.Register(nameof(From), typeof(GridLength?), typeof(GridLengthAnimation));

        public static readonly DependencyProperty ToProperty =
            DependencyProperty.Register(nameof(To), typeof(GridLength?), typeof(GridLengthAnimation));

        public GridLength? From
        {
            get => (GridLength?)GetValue(FromProperty);
            set => SetValue(FromProperty, value);
        }

        public GridLength? To
        {
            get => (GridLength?)GetValue(ToProperty);
            set => SetValue(ToProperty, value);
        }

        public override object GetCurrentValue(object defaultOriginValue, object defaultDestinationValue, AnimationClock animationClock)
        {
            if (animationClock.CurrentProgress == null)
            {
                return defaultOriginValue;
            }

            var from = From ?? (GridLength)defaultOriginValue;
            var to = To ?? (GridLength)defaultDestinationValue;
            var progress = animationClock.CurrentProgress.Value;
            var current = from.Value + ((to.Value - from.Value) * progress);
            return new GridLength(current, GridUnitType.Pixel);
        }

        protected override Freezable CreateInstanceCore()
        {
            return new GridLengthAnimation();
        }
    }
}
