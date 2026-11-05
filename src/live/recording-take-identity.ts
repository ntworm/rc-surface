// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Source: https://github.com/ntworm/rc-surface
//
// Runtime identity of one take-lane clip.
//
// A handle id, a name and a time can all be reused: Live may delete a clip
// and create another one that answers with the same handle, the same name
// and the same span. None of them may address a clip on its own.
//
// This helper addresses a clip by the objects that lead to it - the scope,
// the track, the lane and the clip itself - and by nothing else. Every object
// it has seen earns one opaque id in a WeakMap, so a replaced object always
// earns a new one, even when the host reuses every visible field.
//
// The identity lives only in this process: nothing is written to disk, no
// object is kept alive, no audio file is read and no host-wide id is minted.
export class TakeNotesIdentity {
  private readonly ids = new WeakMap<object, string>();
  private counter = 0;

  /** One opaque id per host object. It is minted once and never reused. */
  private idOf(object: object): string {
    const known = this.ids.get(object);
    if (known !== undefined) return known;
    this.counter += 1;
    const id = 'o' + this.counter;
    this.ids.set(object, id);
    return id;
  }

  /**
   * The reference of one exact chain: scope, track, lane, clip.
   *
   * The same chain always answers with the same reference. A replacement of
   * the track, the lane or the clip answers with a different one, even when
   * the handle, the name and the span are reused.
   */
  public reference(scope: string, track: object, lane: object, clip: object): string {
    if (typeof scope !== 'string' || !scope) throw Error('REC:IDENTITY');
    if (!isObject(track) || !isObject(lane) || !isObject(clip)) throw Error('REC:IDENTITY');
    return scope + '#' + this.idOf(track) + '.' + this.idOf(lane) + '.' + this.idOf(clip);
  }
}

function isObject(value: unknown): value is object {
  return typeof value === 'object' && value !== null;
}
