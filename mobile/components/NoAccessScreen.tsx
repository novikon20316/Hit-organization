import { View, Text } from "react-native";

export default function NoAccessScreen() {
  return (
    <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
      <Text style={{ fontSize: 18, fontWeight: "bold" }}>
        🚫 No Access
      </Text>
      <Text>You are not allowed to view this page.</Text>
    </View>
  );
}