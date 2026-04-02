import { useState } from 'react';
import Animated from 'react-native-reanimated';
import { useAnimatedReaction, runOnJS } from 'react-native-reanimated';
import type { SharedValue } from 'react-native-reanimated';

interface AnimatedTextProps {
  text: SharedValue<string>;
  style?: any;
}

export default function AnimatedText({ text, style }: AnimatedTextProps) {
  const [displayText, setDisplayText] = useState(text.value);

  useAnimatedReaction(
    () => text.value,
    (value) => {
      'worklet';
      runOnJS(setDisplayText)(value);
    },
    [text]
  );

  return <Animated.Text style={style}>{displayText}</Animated.Text>;
}
