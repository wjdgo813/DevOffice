// 첫 화면.
//
// "Hello World"를 쓰지 않는다. 폰에서 처음 열었을 때 기대와의 낙차가 크면
// 첫 성공 경험이 오히려 실망이 된다. 제품 이름이 보여야 "내 것이 생겼다"가 된다.
//
// 화면이 여러 개가 되는 첫 기능에서 expo-router 를 붙인다.
// 지금 미리 붙이지 않는 이유는 화면 구성을 아직 모르기 때문이다.

import { StatusBar } from 'expo-status-bar';
import { SafeAreaView, StyleSheet, Text, useColorScheme, View } from 'react-native';

export default function App() {
  const dark = useColorScheme() === 'dark';
  const theme = dark ? colors.dark : colors.light;

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.bg }]}>
      <StatusBar style={dark ? 'light' : 'dark'} />
      <View style={styles.center}>
        <Text style={[styles.title, { color: theme.fg }]}>
          {{PRODUCT_NAME}}
        </Text>

        <Text style={[styles.subtitle, { color: theme.muted }]}>
          {{ONE_LINER}}
        </Text>

        <Text style={[styles.note, { color: theme.muted }]}>
          아직 준비 중이에요.{'\n'}곧 기능이 하나씩 추가됩니다.
        </Text>
      </View>
    </SafeAreaView>
  );
}

const colors = {
  light: { bg: '#ffffff', fg: '#111827', muted: '#6b7280' },
  dark: { bg: '#0b0f19', fg: '#f9fafb', muted: '#9ca3af' },
};

const styles = StyleSheet.create({
  safe: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, gap: 12 },
  title: { fontSize: 28, fontWeight: '700', textAlign: 'center' },
  subtitle: { fontSize: 15, lineHeight: 22, textAlign: 'center' },
  note: { marginTop: 40, fontSize: 13, lineHeight: 20, textAlign: 'center' },
});
