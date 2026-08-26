export async function commitAfterSuccess<T>(
  mutation: () => Promise<T>,
  onSuccess: () => void,
): Promise<T> {
  const result = await mutation();
  onSuccess();
  return result;
}
