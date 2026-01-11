// Purpose: Converter that translates values for the Inverse Boolean bindings.

using System;
using System.Globalization;
using System.Windows.Data;

namespace CompositionToolbox.App.Converters
{
    [ValueConversion(typeof(bool), typeof(bool))]
    public class InverseBooleanConverter : IValueConverter
    {
        public object Convert(object value, Type targetType, object parameter, CultureInfo culture)
        {
            if (value is bool b) return !b;
            return value ?? true;
        }

        public object ConvertBack(object value, Type targetType, object parameter, CultureInfo culture)
        {
            if (value is bool b) return !b;
            return value ?? true;
        }
    }
}