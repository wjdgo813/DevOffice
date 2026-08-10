// 첫 화면.
//
// "Hello World"를 쓰지 않는다. 배포된 주소를 처음 열었을 때
// 기대와의 낙차가 크면 첫 성공 경험이 오히려 실망이 된다.
// 제품 이름이 보여야 "내 것이 생겼다"가 된다.

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-8 text-center">
      <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
        {{PRODUCT_NAME}}에 오신 걸 환영합니다
      </h1>

      <p className="max-w-md text-balance text-muted-foreground">
        {{ONE_LINER}}
      </p>

      <p className="mt-8 text-sm text-muted-foreground">
        아직 준비 중이에요. 곧 기능이 하나씩 추가됩니다.
      </p>
    </main>
  );
}
