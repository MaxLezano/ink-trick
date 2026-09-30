/**
 * InkTrick - Tour target
 * Marks a view the guided tour can spotlight. Renders a plain View.
 */
import React, { useEffect, useRef } from 'react';
import { View, ViewProps } from 'react-native';
import { registerTarget } from './tour';

export default function TourTarget({ id, ...rest }: ViewProps & { id: string }) {
  const ref = useRef<View>(null);
  useEffect(() => registerTarget(id, ref), [id]);
  // collapsable=false: Android must keep a real native view to measure.
  return <View ref={ref} collapsable={false} {...rest} />;
}
