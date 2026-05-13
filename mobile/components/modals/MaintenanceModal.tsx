import React from "react";
import {
  Modal,
  View,
  Text,
  ScrollView,
  Pressable,
  TextInput,
} from "react-native";
import { Picker } from "@react-native-picker/picker";

type Props = {
  visible: boolean;
  setVisible: (v: boolean) => void;

  lang: "he" | "en";

  title: string;
  setTitle: (v: string) => void;

  days: number;
  setDays: (v: number) => void;

  hours: number;
  setHours: (v: number) => void;

  minutes: number;
  setMinutes: (v: number) => void;

  onSave: () => void;

  styles: any;
};

export default function MaintenanceModal({
  visible,
  setVisible,
  lang,
  title,
  setTitle,
  days,
  setDays,
  hours,
  setHours,
  minutes,
  setMinutes,
  onSave,
  styles,
}: Props) {
  return (
    <Modal visible={visible} animationType="slide">
      <View style={styles.modalRoot}>
        <ScrollView contentContainerStyle={styles.modalContent}>

          {/* Header */}
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>
              🛠️ {lang === "he" ? "מצב תחזוקה" : "Maintenance"}
            </Text>

            <Pressable onPress={() => setVisible(false)}>
              <Text style={styles.close}>✕</Text>
            </Pressable>
          </View>

          {/* Title */}
          <TextInput
            placeholder={lang === "he" ? "כותרת" : "Title"}
            value={title}
            onChangeText={setTitle}
            style={styles.input}
          />

          {/* Days */}
          <Text style={styles.fieldLabel}>Days</Text>
          <Picker selectedValue={days} onValueChange={setDays}>
            {[...Array(8).keys()].map((d) => (
              <Picker.Item key={d} label={`${d}`} value={d} />
            ))}
          </Picker>

          {/* Hours */}
          <Text style={styles.fieldLabel}>Hours</Text>
          <Picker selectedValue={hours} onValueChange={setHours}>
            {[...Array(24).keys()].map((h) => (
              <Picker.Item key={h} label={`${h}`} value={h} />
            ))}
          </Picker>

          {/* Minutes */}
          <Text style={styles.fieldLabel}>Minutes</Text>
          <Picker selectedValue={minutes} onValueChange={setMinutes}>
            {[0, 5, 10, 15, 30, 45, 50, 55].map((m) => (
              <Picker.Item key={m} label={`${m}`} value={m} />
            ))}
          </Picker>

          {/* Submit */}
          <Pressable style={styles.submitBtn} onPress={onSave}>
            <Text style={styles.submitBtnText}>
              {lang === "he" ? "שמור ושלח" : "Save & Send"}
            </Text>
          </Pressable>
        </ScrollView>
      </View>
    </Modal>
  );
}
