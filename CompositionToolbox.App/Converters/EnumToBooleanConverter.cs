using System;
using System.Globalization;
using System.Windows.Data;

namespace CompositionToolbox.App.Converters
{
    public class EnumToBooleanConverter : IValueConverter
    {
        public object Convert(object value, Type targetType, object parameter, CultureInfo culture)
        {
            if (value == null || parameter == null) return false;
            var parameterString = parameter.ToString();
            if (parameterString == null) return false;
            return value.ToString() == parameterString;
        }

        public object ConvertBack(object value, Type targetType, object parameter, CultureInfo culture)
        {
            if (parameter == null) return System.Windows.Data.Binding.DoNothing;
            if (value is true)
            {
                var parameterString = parameter.ToString();
                if (parameterString == null) return System.Windows.Data.Binding.DoNothing;
                return Enum.Parse(targetType, parameterString);
            }
            return System.Windows.Data.Binding.DoNothing;
        }
    }
}
