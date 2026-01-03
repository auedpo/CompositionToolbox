using System;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;

namespace CompositionToolbox.App.Views.Behaviors
{
    public static class SliderWheelBehavior
    {
        public static readonly DependencyProperty EnableFineWheelProperty =
            DependencyProperty.RegisterAttached(
                "EnableFineWheel",
                typeof(bool),
                typeof(SliderWheelBehavior),
                new PropertyMetadata(false, OnEnableFineWheelChanged));

        public static readonly DependencyProperty DisableFineWheelProperty =
            DependencyProperty.RegisterAttached(
                "DisableFineWheel",
                typeof(bool),
                typeof(SliderWheelBehavior),
                new PropertyMetadata(false));

        static SliderWheelBehavior()
        {
            EventManager.RegisterClassHandler(typeof(Slider), UIElement.PreviewMouseWheelEvent,
                new MouseWheelEventHandler(Slider_PreviewMouseWheel));
        }

        public static void EnsureInitialized()
        {
            // Intentionally empty; calling this forces the static constructor to run.
        }

        public static bool GetEnableFineWheel(DependencyObject obj)
            => (bool)obj.GetValue(EnableFineWheelProperty);

        public static void SetEnableFineWheel(DependencyObject obj, bool value)
            => obj.SetValue(EnableFineWheelProperty, value);

        public static bool GetDisableFineWheel(DependencyObject obj)
            => (bool)obj.GetValue(DisableFineWheelProperty);

        public static void SetDisableFineWheel(DependencyObject obj, bool value)
            => obj.SetValue(DisableFineWheelProperty, value);

        private static void OnEnableFineWheelChanged(DependencyObject d, DependencyPropertyChangedEventArgs e)
        {
            if (d is not Slider slider) return;
            if ((bool)e.NewValue)
            {
                slider.PreviewMouseWheel += Slider_PreviewMouseWheel;
            }
            else
            {
                slider.PreviewMouseWheel -= Slider_PreviewMouseWheel;
            }
        }

        private static void Slider_PreviewMouseWheel(object sender, MouseWheelEventArgs e)
        {
            if (sender is not Slider slider || !slider.IsEnabled)
            {
                return;
            }

            if (GetDisableFineWheel(slider))
            {
                return;
            }

            var range = slider.Maximum - slider.Minimum;
            var step = slider.SmallChange;
            if (step <= 0 && range > 0)
            {
                step = range / 100.0;
            }
            if (range > 0 && step >= range)
            {
                step = range / 100.0;
            }
            if (step <= 0)
            {
                step = 0.1;
            }

            var delta = e.Delta > 0 ? step : -step;
            var next = Math.Clamp(slider.Value + delta, slider.Minimum, slider.Maximum);

            if (slider.IsSnapToTickEnabled && slider.TickFrequency > 0)
            {
                var ticks = Math.Round((next - slider.Minimum) / slider.TickFrequency);
                next = slider.Minimum + (ticks * slider.TickFrequency);
            }

            slider.Value = next;
            e.Handled = true;
        }
    }
}
