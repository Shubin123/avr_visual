; fibonacci.asm
; Compute the Fibonacci sequence (0, 1, 1, 2, 5, 8, ...) in a loop and store
; each term in data memory. A pure-computation example that's great for
; watching the register file, SREG flags, and the memory map update.
;
; The loop stops once the next term would overflow 8 bits (terms > 255),
; which happens right after 233 (the 13th term).

.dseg
.org 0x200
FIB: .byte 32              ; room for up to 32 computed terms

.cseg
.org 0

start:
    ldi r26, low(FIB)
    ldi r27, high(FIB)     ; X -> FIB buffer

    ; Seed the first two terms: F(0)=0, F(1)=1.
    ldi r16, 0
    st X+, r16
    ldi r16, 1
    st X+, r16

    clr r18                ; previous term  (a)
    ldi r19, 1             ; current term   (b)

next_term:
    mov r20, r18           ; t = a
    add r20, r19           ; t = a + b
    brcc store_term        ; if no carry, the sum still fits in 8 bits
    rjmp done              ; overflow -> we're done

store_term:
    st X+, r20             ; save the new term
    mov r18, r19           ; a = b
    mov r19, r20           ; b = t
    rjmp next_term

done:
    rjmp done
