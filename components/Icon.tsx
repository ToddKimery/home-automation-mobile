import { Image } from 'react-native';

const icons = {
  back: require('../assets/icons/back.png'),
  brand: require('../assets/icons/brand.png'),
  cloud: require('../assets/icons/cloud.png'),
  graph: require('../assets/icons/graph.png'),
  humidity: require('../assets/icons/humidity.png'),
  local: require('../assets/icons/local.png'),
  refresh: require('../assets/icons/refresh.png'),
  temperature: require('../assets/icons/temperature.png'),
};

export default function Icon({ name, size = 20, color }: {
  name: keyof typeof icons;
  size?: number;
  color?: string;
}) {
  return (
    <Image
      accessible={false}
      importantForAccessibility="no"
      source={icons[name]}
      style={{ width: size, height: size, tintColor: color }}
    />
  );
}
