export interface Page {
    render(): string;
    init?(): void;
}